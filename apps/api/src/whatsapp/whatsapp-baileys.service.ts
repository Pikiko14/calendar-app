import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  generateWAMessageFromContent,
  makeCacheableSignalKeyStore,
  proto,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import {
  DEFAULT_ANTI_BAN,
  SerialQueue,
  SlidingWindowCounter,
  jitter,
  sleep,
  typingDelayMs,
  type AntiBanOptions,
} from './whatsapp-anti-ban';
import {
  formatReplyWithActions,
  resolveInteractiveInput,
  type BotAction,
} from './whatsapp-bot-ui';

type SessionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

type SessionState = {
  sock?: WASocket;
  status: SessionStatus;
  qr?: string;
  qrDataUrl?: string;
  phone?: string;
  lastError?: string;
  starting?: boolean;
  reconnectAttempt?: number;
  /** Evita que sockets viejos disparen reconexiones duplicadas */
  generation?: number;
  reconnectTimer?: NodeJS.Timeout;
};

@Injectable()
export class WhatsappBaileysService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappBaileysService.name);
  private readonly sessions = new Map<string, SessionState>();
  private readonly loggerBaileys = pino({ level: 'silent' });
  private readonly sendQueue = new SerialQueue();
  private readonly rate = new SlidingWindowCounter();
  private readonly lastOutbound = new Map<string, number>();
  private readonly inboundTimers = new Map<string, NodeJS.Timeout>();
  private readonly antiBan: AntiBanOptions;
  /** Caché de mensajes salientes para retries de Baileys (evita Bad MAC en reenvíos). */
  private readonly recentMessages = new Map<string, WAMessage['message']>();
  private unhandledHooked = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {
    const cfg = this.config.get<Partial<AntiBanOptions>>('whatsapp.antiBan') || {};
    this.antiBan = { ...DEFAULT_ANTI_BAN, ...cfg };
  }

  async onModuleInit() {
    this.hookUnhandledBaileysErrors();
    const enabled = this.config.get<boolean>('whatsapp.enabled');
    if (!enabled) {
      this.logger.log('WhatsApp Baileys deshabilitado (WHATSAPP_ENABLED=false)');
      return;
    }
    const bots = await this.prisma.whatsAppBotConfig.findMany({
      where: { enabled: true },
      select: { tenantId: true },
    });
    for (const bot of bots) {
      const dir = this.authDir(bot.tenantId);
      if (existsSync(join(dir, 'creds.json'))) {
        this.logger.log(`Reconectando WhatsApp tenant ${bot.tenantId}`);
        void this.connect(bot.tenantId).catch((e) =>
          this.logger.warn(`No se pudo reconectar ${bot.tenantId}: ${e}`),
        );
      }
    }
  }

  /** Evita que errores internos de Baileys (Connection Closed / Bad MAC) tumben Node. */
  private hookUnhandledBaileysErrors() {
    if (this.unhandledHooked) return;
    this.unhandledHooked = true;
    process.on('unhandledRejection', (reason) => {
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'object' && reason && 'message' in reason
            ? String((reason as { message: unknown }).message)
            : String(reason);
      if (
        /Connection Closed|Bad MAC|Key used already|Failed to decrypt|Precondition Required/i.test(
          msg,
        )
      ) {
        this.logger.warn(`WhatsApp (ignorado): ${msg}`);
        return;
      }
    });
  }

  async onModuleDestroy() {
    for (const timer of this.inboundTimers.values()) clearTimeout(timer);
    this.inboundTimers.clear();
    for (const [tenantId, session] of this.sessions) {
      try {
        if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
        session.sock?.end(undefined);
      } catch {
        /* ignore */
      }
      this.releaseSessionLock(tenantId);
      this.sessions.delete(tenantId);
    }
  }

  private lockPath(tenantId: string) {
    return join(this.authDir(tenantId), '.instance.lock');
  }

  /** Evita dos procesos Node usando la misma sesión Baileys (Bad MAC / desconexiones). */
  private tryAcquireSessionLock(tenantId: string): boolean {
    const path = this.lockPath(tenantId);
    try {
      if (existsSync(path)) {
        const raw = readFileSync(path, 'utf8').trim();
        const oldPid = Number(raw);
        if (oldPid && oldPid !== process.pid) {
          try {
            process.kill(oldPid, 0);
            this.logger.error(
              `WhatsApp tenant=${tenantId} ya lo usa otro proceso (PID ${oldPid}). Cierra esa API y reintenta.`,
            );
            return false;
          } catch {
            /* PID muerto → lock obsoleto */
          }
        }
      }
      writeFileSync(path, String(process.pid), 'utf8');
      return true;
    } catch (e) {
      this.logger.warn(`Lock WhatsApp no disponible: ${e}`);
      return true;
    }
  }

  private releaseSessionLock(tenantId: string) {
    try {
      const path = this.lockPath(tenantId);
      if (!existsSync(path)) return;
      const owner = Number(readFileSync(path, 'utf8').trim());
      if (!owner || owner === process.pid) unlinkSync(path);
    } catch {
      /* ignore */
    }
  }

  private sessionRoot() {
    return (
      this.config.get<string>('whatsapp.sessionPath') ||
      join(process.cwd(), 'bot_sessions')
    );
  }

  private authDir(tenantId: string) {
    const dir = join(this.sessionRoot(), tenantId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  getStatus(tenantId: string) {
    const s = this.sessions.get(tenantId);
    const hasSession = existsSync(join(this.authDir(tenantId), 'creds.json'));
    return {
      serverEnabled: this.config.get<boolean>('whatsapp.enabled') !== false,
      status: s?.status || (hasSession ? 'disconnected' : 'disconnected'),
      phone: s?.phone || null,
      hasQr: Boolean(s?.qrDataUrl),
      hasSession,
      sessionKey: tenantId,
      lastError: s?.lastError || null,
      antiBan: {
        minGapMs: this.antiBan.minGapMs,
        maxPerMinuteTenant: this.antiBan.maxPerMinuteTenant,
        maxPerMinuteChat: this.antiBan.maxPerMinuteChat,
      },
    };
  }

  async getStatusWithConfig(tenantId: string) {
    const status = this.getStatus(tenantId);
    const config = await this.whatsapp.getBotConfig(tenantId);
    return {
      ...status,
      phone: status.phone || config.phoneNumber || null,
      config: {
        enabled: config.enabled,
        welcomeMsg: config.welcomeMsg,
        businessName: config.businessName,
        aiEnabled: config.aiEnabled,
        phoneNumber: config.phoneNumber,
        tenantName: config.tenantName,
        tenantSlug: config.tenantSlug,
        sessionKey: config.sessionKey,
      },
    };
  }

  async getQr(tenantId: string) {
    const s = this.sessions.get(tenantId);
    return {
      status: s?.status || 'disconnected',
      qr: s?.qrDataUrl || null,
      phone: s?.phone || null,
      sessionKey: tenantId,
    };
  }

  async connect(tenantId: string) {
    if (this.config.get<boolean>('whatsapp.enabled') === false) {
      throw new Error(
        'WhatsApp está deshabilitado en el servidor (WHATSAPP_ENABLED).',
      );
    }

    const config = await this.whatsapp.getBotConfig(tenantId);
    if (!config.enabled) {
      await this.whatsapp.updateBotConfig(tenantId, { enabled: true });
    }

    const existing = this.sessions.get(tenantId);
    if (existing?.status === 'connected') {
      return this.getStatusWithConfig(tenantId);
    }
    if (existing?.starting) {
      return this.getStatusWithConfig(tenantId);
    }

    await this.startSocket(tenantId);
    return this.getStatusWithConfig(tenantId);
  }

  async disconnect(tenantId: string, logout = true) {
    const session = this.sessions.get(tenantId);
    try {
      if (logout && session?.sock) {
        await session.sock.logout();
      } else {
        session?.sock?.end(undefined);
      }
    } catch (e) {
      this.logger.warn(`Error al desconectar ${tenantId}: ${e}`);
    }
    this.sessions.set(tenantId, { status: 'disconnected' });

    if (logout) {
      const dir = this.authDir(tenantId);
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }

    await this.prisma.whatsAppBotConfig.updateMany({
      where: { tenantId },
      data: logout
        ? { phoneNumber: null, enabled: false }
        : { phoneNumber: null },
    });

    return this.getStatusWithConfig(tenantId);
  }

  async sendText(tenantId: string, phone: string, text: string) {
    const session = this.sessions.get(tenantId);
    if (!session?.sock || session.status !== 'connected') {
      throw new Error('WhatsApp no está conectado para este negocio.');
    }
    const jid = this.toJid(phone);
    await this.sendSafe(tenantId, session.sock, jid, text);
  }

  async sendBotReply(
    tenantId: string,
    sock: WASocket,
    jid: string,
    text: string,
    actions?: BotAction[],
  ) {
    return this.sendSafe(tenantId, sock, jid, text, actions);
  }

  /**
   * Envío anti-ban: cola por tenant, rate limit, gap, typing y presencia.
   */
  private async sendSafe(
    tenantId: string,
    sock: WASocket,
    jid: string,
    text: string,
    actions?: BotAction[],
  ) {
    return this.sendQueue.enqueue(tenantId, async () => {
      const tenantKey = `t:${tenantId}`;
      const chatKey = `c:${tenantId}:${jid}`;

      if (this.rate.count(tenantKey) >= this.antiBan.maxPerMinuteTenant) {
        throw new Error(
          'Límite anti-ban: demasiados mensajes del negocio por minuto. Reintenta pronto.',
        );
      }
      if (this.rate.count(chatKey) >= this.antiBan.maxPerMinuteChat) {
        throw new Error(
          'Límite anti-ban: demasiados mensajes a este chat por minuto.',
        );
      }

      const last = this.lastOutbound.get(tenantId) || 0;
      const waitGap = this.antiBan.minGapMs - (Date.now() - last);
      if (waitGap > 0) await sleep(waitGap + jitter(0, 400));

      const liveEarly = this.sessions.get(tenantId);
      const activeSock =
        liveEarly?.status === 'connected' && liveEarly.sock
          ? liveEarly.sock
          : sock;

      try {
        await activeSock.presenceSubscribe(jid);
        await activeSock.sendPresenceUpdate('composing', jid);
      } catch {
        /* presencia opcional */
      }

      const body = formatReplyWithActions(text, actions);
      await sleep(typingDelayMs(body, this.antiBan) + jitter(0, 350));

      const live = this.sessions.get(tenantId);
      if (!live?.sock || live.status !== 'connected') {
        throw new Error('WhatsApp se desconectó durante el envío.');
      }

      const useInteractive =
        this.config.get<boolean>('whatsapp.interactiveButtons') === true &&
        !!actions?.length;

      let sent;
      try {
        if (useInteractive) {
          // Experimental: muchos clientes móviles no renderizan nativeFlow vía Baileys.
          try {
            await this.sendInteractive(live.sock, jid, text, actions!);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`Botones WA fallaron (se envía texto): ${msg}`);
          }
        }
        // Siempre texto: es lo que llega de forma fiable al móvil.
        sent = await live.sock.sendMessage(jid, { text: body });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/Connection Closed|timed out|not connected/i.test(msg)) {
          throw new Error('WhatsApp no está conectado. Reintenta en unos segundos.');
        }
        throw e;
      }

      if (sent?.key?.id && sent.message) {
        this.rememberMessage(sent.key.id, sent.message);
      }

      try {
        await live.sock.sendPresenceUpdate('paused', jid);
      } catch {
        /* ignore */
      }

      this.lastOutbound.set(tenantId, Date.now());
      this.rate.push(tenantKey);
      this.rate.push(chatKey);
    });
  }

  /** Botones (≤3) o lista interactiva (>3). Fallback interno a texto si WA rechaza. */
  private async sendInteractive(
    sock: WASocket,
    jid: string,
    text: string,
    actions: BotAction[],
  ) {
    const buttons =
      actions.length <= 3
        ? actions.map((a) => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
              display_text: a.title.slice(0, 20),
              id: a.id,
            }),
          }))
        : [
            {
              name: 'single_select',
              buttonParamsJson: JSON.stringify({
                title: 'Elegir opción',
                sections: [
                  {
                    title: 'Opciones',
                    rows: actions.map((a) => ({
                      header: '',
                      title: a.title.slice(0, 24),
                      description: (a.description || '').slice(0, 72),
                      id: a.id,
                    })),
                  },
                ],
              }),
            },
          ];

    const content = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: 'BeautyBook',
            }),
            nativeFlowMessage:
              proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: buttons.map((b) =>
                  proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create(
                    b,
                  ),
                ),
              }),
          }),
        },
      },
    };

    const me = sock.user?.id || '';
    const msg = generateWAMessageFromContent(jid, content as proto.IMessage, {
      userJid: me,
    });
    await sock.relayMessage(jid, msg.message!, {
      messageId: msg.key.id!,
    });
    return msg;
  }

  private rememberMessage(id: string, message: WAMessage['message']) {
    if (!message) return;
    this.recentMessages.set(id, message);
    if (this.recentMessages.size > 200) {
      const first = this.recentMessages.keys().next().value;
      if (first) this.recentMessages.delete(first);
    }
  }

  private async endSocketQuietly(sock?: WASocket) {
    if (!sock) return;
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.ev.removeAllListeners('creds.update');
    } catch {
      /* ignore */
    }
    try {
      sock.end(undefined);
    } catch {
      /* ignore */
    }
  }

  private async startSocket(tenantId: string) {
    if (!this.tryAcquireSessionLock(tenantId)) {
      const s = this.sessions.get(tenantId) || {
        status: 'disconnected' as SessionStatus,
      };
      s.status = 'disconnected';
      s.lastError =
        'Otra instancia de la API ya tiene WhatsApp conectado. Deja solo un proceso en el puerto 3000.';
      this.sessions.set(tenantId, s);
      return;
    }

    const prev = this.sessions.get(tenantId);
    if (prev?.reconnectTimer) {
      clearTimeout(prev.reconnectTimer);
      prev.reconnectTimer = undefined;
    }
    await this.endSocketQuietly(prev?.sock);

    const generation = (prev?.generation || 0) + 1;
    const state: SessionState = {
      status: 'connecting',
      starting: true,
      reconnectAttempt: prev?.reconnectAttempt || 0,
      generation,
    };
    this.sessions.set(tenantId, state);

    const { state: authState, saveCreds } = await useMultiFileAuthState(
      this.authDir(tenantId),
    );
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, this.loggerBaileys),
      },
      logger: this.loggerBaileys,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      browser: ['BeautyBook', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 25_000,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 3,
      getMessage: async (key) => {
        if (!key.id) return undefined;
        return this.recentMessages.get(key.id) ?? undefined;
      },
    });

    state.sock = sock;
    this.sessions.set(tenantId, state);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      void this.onConnectionUpdate(tenantId, generation, sock, update);
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      const current = this.sessions.get(tenantId);
      if (!current || current.generation !== generation) return;
      for (const msg of messages) {
        if (msg.key?.id && msg.message) {
          this.rememberMessage(msg.key.id, msg.message);
        }
        this.scheduleIncoming(tenantId, sock, msg);
      }
    });
  }

  private async onConnectionUpdate(
    tenantId: string,
    generation: number,
    sock: WASocket,
    update: {
      connection?: string;
      lastDisconnect?: { error?: Error };
      qr?: string;
    },
  ) {
    const current = this.sessions.get(tenantId);
    if (!current || current.generation !== generation) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      current.status = 'qr';
      current.qr = qr;
      current.starting = false;
      try {
        current.qrDataUrl = await QRCode.toDataURL(qr, {
          margin: 1,
          width: 320,
        });
      } catch (e) {
        this.logger.warn(`No se pudo generar QR: ${e}`);
      }
      this.sessions.set(tenantId, current);
    }

    if (connection === 'open') {
      current.status = 'connected';
      current.qr = undefined;
      current.qrDataUrl = undefined;
      current.starting = false;
      current.lastError = undefined;
      current.reconnectAttempt = 0;
      const me = sock.user?.id?.split(':')[0];
      current.phone = me ? `+${me.replace(/\D/g, '')}` : undefined;
      this.sessions.set(tenantId, current);
      await this.prisma.whatsAppBotConfig.updateMany({
        where: { tenantId },
        data: {
          enabled: true,
          phoneNumber: current.phone,
        },
      });
      this.logger.log(
        `WhatsApp conectado tenant=${tenantId} phone=${current.phone}`,
      );
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const replaced =
        code === DisconnectReason.connectionReplaced ||
        /replaced|conflict/i.test(lastDisconnect?.error?.message || '');
      current.status = 'disconnected';
      current.starting = false;
      current.sock = undefined;
      current.lastError = loggedOut
        ? 'Sesión cerrada. Escanea el QR de nuevo.'
        : replaced
          ? 'Sesión tomada por otra instancia de la API. Cierra procesos duplicados en :3000.'
          : lastDisconnect?.error?.message || 'Conexión cerrada';
      this.sessions.set(tenantId, current);

      if (loggedOut) {
        try {
          rmSync(this.authDir(tenantId), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        this.releaseSessionLock(tenantId);
        return;
      }

      // Si otra instancia robó la sesión, NO reconectar en bucle (causa Bad MAC).
      if (replaced) {
        this.logger.error(
          `WhatsApp tenant=${tenantId}: conexión reemplazada. Deteniendo reconexión automática.`,
        );
        this.releaseSessionLock(tenantId);
        return;
      }

      const attempt = (current.reconnectAttempt || 0) + 1;
      current.reconnectAttempt = attempt;
      const delay =
        Math.min(60_000, 2000 * 2 ** Math.min(attempt - 1, 5)) +
        jitter(0, 1500);
      this.logger.warn(
        `WhatsApp desconectado tenant=${tenantId}, reintento #${attempt} en ${Math.round(delay / 1000)}s`,
      );
      current.reconnectTimer = setTimeout(() => {
        const still = this.sessions.get(tenantId);
        if (!still || still.generation !== generation) return;
        if (still.status === 'connected' || still.starting) return;
        void this.startSocket(tenantId).catch((e) =>
          this.logger.error(`Reintento falló: ${e}`),
        );
      }, delay);
      this.sessions.set(tenantId, current);
    }
  }

  /** Debounce por chat: evita ráfagas y procesa el último mensaje. */
  private scheduleIncoming(tenantId: string, sock: WASocket, msg: WAMessage) {
    if (msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    if (!jid || !this.isPrivateChat(jid)) return;

    const key = `${tenantId}:${jid}`;
    const prev = this.inboundTimers.get(key);
    if (prev) clearTimeout(prev);

    const timer = setTimeout(() => {
      this.inboundTimers.delete(key);
      void this.handleIncomingMessage(tenantId, sock, msg);
    }, this.antiBan.inboundDebounceMs);

    this.inboundTimers.set(key, timer);
  }

  private isPrivateChat(jid: string) {
    if (jid.endsWith('@g.us')) return false;
    if (jid === 'status@broadcast') return false;
    if (jid.endsWith('@broadcast')) return false;
    if (jid.endsWith('@newsletter')) return false;
    return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
  }

  private async handleIncomingMessage(
    tenantId: string,
    sock: WASocket,
    msg: WAMessage,
  ) {
    try {
      if (msg.key.fromMe) return;
      const jid = msg.key.remoteJid;
      if (!jid || !this.isPrivateChat(jid)) return;

      const text = this.extractText(msg);
      if (!text) return;

      // Marcar leído (comportamiento humano)
      try {
        await sock.readMessages([msg.key]);
      } catch {
        /* ignore */
      }

      const phone = await this.resolveInboundPhone(sock, msg);
      if (!phone) {
        this.logger.warn(`WA IN sin teléfono resoluble: ${jid}`);
        return;
      }
      this.logger.debug(`WA IN ${tenantId} ${phone} (jid=${jid}): ${text}`);

      const result = await this.whatsapp.handleIncoming(tenantId, phone, text);
      if (result?.reply) {
        await this.sendSafe(
          tenantId,
          sock,
          jid,
          result.reply,
          result.actions,
        );
      }
    } catch (e) {
      this.logger.error(`Error procesando mensaje WA: ${e}`);
      try {
        if (msg.key.remoteJid) {
          await this.sendSafe(
            tenantId,
            sock,
            msg.key.remoteJid,
            'Hubo un problema procesando tu mensaje. Escribe MENU para reiniciar.',
          );
        }
      } catch {
        /* ignore */
      }
    }
  }

  private extractText(msg: WAMessage): string | null {
    const m = msg.message;
    if (!m) return null;

    const interactiveId = this.extractInteractiveId(m);
    if (interactiveId) return resolveInteractiveInput(interactiveId);

    const plain =
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.buttonsResponseMessage?.selectedButtonId ||
      m.buttonsResponseMessage?.selectedDisplayText ||
      m.templateButtonReplyMessage?.selectedId ||
      m.listResponseMessage?.singleSelectReply?.selectedRowId ||
      m.listResponseMessage?.title ||
      null;

    return plain ? resolveInteractiveInput(plain) : null;
  }

  private extractInteractiveId(m: proto.IMessage): string | null {
    const native =
      m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    if (native) {
      try {
        const parsed = JSON.parse(native) as { id?: string; selectedId?: string };
        if (parsed.id) return parsed.id;
        if (parsed.selectedId) return parsed.selectedId;
      } catch {
        /* ignore */
      }
    }
    const btn = m.buttonsResponseMessage?.selectedButtonId;
    if (btn) return btn;
    const tpl = m.templateButtonReplyMessage?.selectedId;
    if (tpl) return tpl;
    const row = m.listResponseMessage?.singleSelectReply?.selectedRowId;
    if (row) return row;
    return null;
  }

  private jidToPhone(jid: string) {
    const num = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (num.length === 10 && num.startsWith('3')) return `57${num}`;
    return num;
  }

  /**
   * WhatsApp a menudo entrega mensajes con JID @lid (no el número).
   * Sin mapear a PN, el bot crea otro "cliente" y el "1" no confirma la reserva web.
   */
  private async resolveInboundPhone(
    sock: WASocket,
    msg: WAMessage,
  ): Promise<string | null> {
    const jid = msg.key.remoteJid;
    if (!jid) return null;

    const key = msg.key as WAMessage['key'] & {
      remoteJidAlt?: string;
      senderPn?: string;
      participantAlt?: string;
      participantPn?: string;
    };

    const candidates = [
      jid.endsWith('@s.whatsapp.net') ? jid : null,
      key.remoteJidAlt,
      key.senderPn,
      key.participantAlt,
      key.participantPn,
    ].filter(Boolean) as string[];

    for (const c of candidates) {
      if (c.includes('@s.whatsapp.net') || (!c.includes('@') && /^\d{10,15}$/.test(c))) {
        const phone = this.jidToPhone(c.includes('@') ? c : `${c}@s.whatsapp.net`);
        if (phone.length >= 10) return phone;
      }
    }

    if (jid.endsWith('@lid')) {
      try {
        const mapping = (
          sock as WASocket & {
            signalRepository?: {
              lidMapping?: {
                getPNForLID?: (lid: string) => Promise<string | null> | string | null;
              };
            };
          }
        ).signalRepository?.lidMapping;
        const pn = mapping?.getPNForLID
          ? await Promise.resolve(mapping.getPNForLID(jid))
          : null;
        if (pn) {
          const phone = this.jidToPhone(pn);
          if (phone.length >= 10) {
            this.logger.debug(`LID ${jid} → PN ${phone}`);
            return phone;
          }
        }
      } catch (e) {
        this.logger.debug(
          `No se pudo mapear LID: ${e instanceof Error ? e.message : e}`,
        );
      }

      // Último recurso: conversación BOOKING_CONFIRM reciente del tenant (1 sola)
      // se resuelve en whatsapp.service; aquí devolvemos null para forzar fallback allí
      const lidDigits = this.jidToPhone(jid);
      return lidDigits || null;
    }

    const phone = this.jidToPhone(jid);
    return phone.length >= 8 ? phone : null;
  }

  /** Normaliza a dígitos internacionales (CO: 10 dígitos móvil → 57…). */
  private normalizePhoneDigits(phone: string) {
    let num = phone.replace(/\D/g, '');
    if (num.startsWith('00')) num = num.slice(2);
    if (num.length === 10 && num.startsWith('3')) num = `57${num}`;
    return num;
  }

  private toJid(phone: string) {
    return `${this.normalizePhoneDigits(phone)}@s.whatsapp.net`;
  }
}
