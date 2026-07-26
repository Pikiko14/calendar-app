import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappBaileysService } from '../whatsapp/whatsapp-baileys.service';
import {
  CreateFromAppointmentDto,
  CreateInvoiceDto,
  PayInvoiceDto,
} from './dto/invoices.dto';
import { bogotaDayRange } from '../common/bogota-day';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WhatsappBaileysService))
    private readonly baileys: WhatsappBaileysService,
  ) {}

  list(tenantId: string, status?: InvoiceStatus, clientId?: string) {
    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
        ...(clientId ? { clientId } : {}),
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        appointment: {
          select: { id: true, startAt: true, status: true },
        },
        items: { orderBy: { sortOrder: 'asc' } },
        payments: {
          select: { id: true, amount: true, method: true, paidAt: true, status: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }

  async byAppointment(tenantId: string, appointmentId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        appointmentId,
        status: { not: InvoiceStatus.CANCELLED },
      },
      include: {
        client: true,
        items: { orderBy: { sortOrder: 'asc' } },
        appointment: {
          include: {
            service: true,
            worker: { select: { firstName: true, lastName: true } },
          },
        },
        payments: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
    return invoice;
  }

  async one(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        appointment: {
          include: {
            service: true,
            worker: { select: { firstName: true, lastName: true } },
          },
        },
        items: { orderBy: { sortOrder: 'asc' } },
        payments: true,
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');
    return invoice;
  }

  private async nextNumber(tenantId: string) {
    const year = new Date().getFullYear();
    const prefix = `FAC-${year}-`;
    const last = await this.prisma.invoice.findFirst({
      where: { tenantId, number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    let seq = 1;
    if (last?.number) {
      const part = last.number.slice(prefix.length);
      const n = Number.parseInt(part, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async create(tenantId: string, dto: CreateInvoiceDto) {
    if (dto.appointmentId) {
      return this.createFromAppointment(tenantId, {
        appointmentId: dto.appointmentId,
        tax: dto.tax,
        notes: dto.notes,
      });
    }

    const items = dto.items || [];
    if (!items.length) {
      throw new BadRequestException('Agrega al menos un ítem a la factura.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });

    const mapped = items.map((it, i) => {
      const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
      const unit = Number(it.unitPrice);
      const total = Math.round(qty * unit * 100) / 100;
      return {
        description: it.description,
        quantity: qty,
        unitPrice: new Prisma.Decimal(unit),
        total: new Prisma.Decimal(total),
        serviceId: it.serviceId,
        sortOrder: i,
      };
    });

    const subtotal = mapped.reduce((s, it) => s + Number(it.total), 0);
    const tax = Number(dto.tax || 0);
    const total = Math.round((subtotal + tax) * 100) / 100;
    const number = await this.nextNumber(tenantId);

    return this.prisma.invoice.create({
      data: {
        tenantId,
        number,
        clientId: dto.clientId,
        status: InvoiceStatus.ISSUED,
        currency: dto.currency || tenant?.currency || 'COP',
        subtotal,
        tax,
        total,
        notes: dto.notes,
        items: { create: mapped },
      },
      include: {
        client: true,
        items: true,
      },
    });
  }

  async createFromAppointment(
    tenantId: string,
    dto: CreateFromAppointmentDto,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId, tenantId, deletedAt: null },
      include: {
        service: true,
        client: true,
        worker: { select: { firstName: true, lastName: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada.');

    const existing = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        appointmentId: appointment.id,
        status: { not: InvoiceStatus.CANCELLED },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe la factura ${existing.number} para esta cita.`,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });

    const unit = Number(appointment.price);
    const discount = Number(appointment.discount || 0);
    const lineTotal = Math.max(0, unit - discount);
    const tax = Number(dto.tax || 0);
    const total = Math.round((lineTotal + tax) * 100) / 100;
    const number = await this.nextNumber(tenantId);
    const workerName =
      `${appointment.worker.firstName} ${appointment.worker.lastName}`.trim();

    return this.prisma.invoice.create({
      data: {
        tenantId,
        number,
        clientId: appointment.clientId,
        appointmentId: appointment.id,
        status: InvoiceStatus.ISSUED,
        currency: tenant?.currency || 'COP',
        subtotal: lineTotal,
        tax,
        total,
        notes:
          dto.notes ||
          `Cita ${appointment.startAt.toISOString().slice(0, 16).replace('T', ' ')} · ${workerName}`,
        items: {
          create: [
            {
              description: appointment.service.name,
              quantity: 1,
              unitPrice: unit,
              total: lineTotal,
              serviceId: appointment.serviceId,
              sortOrder: 0,
            },
          ],
        },
      },
      include: {
        client: true,
        items: true,
        appointment: { select: { id: true, startAt: true } },
      },
    });
  }

  /**
   * Emite factura pagada (ISSUED→PAID + Payment) para ventas de catálogo
   * (paquetes, gift cards, etc.).
   */
  async issuePaidSale(
    tenantId: string,
    input: {
      clientId?: string | null;
      description: string;
      amount: number;
      notes?: string;
      metadata: Record<string, unknown>;
      method?: PaymentMethod;
      currency?: string;
    },
  ) {
    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (amount < 0) {
      throw new BadRequestException('El monto de la factura no es válido.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });
    const currency = input.currency || tenant?.currency || 'COP';
    const number = await this.nextNumber(tenantId);
    const method = input.method || PaymentMethod.CASH;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          number,
          clientId: input.clientId || undefined,
          status: InvoiceStatus.PAID,
          currency,
          subtotal: amount,
          tax: 0,
          total: amount,
          notes: input.notes,
          paidAt: now,
          metadata: input.metadata as Prisma.InputJsonValue,
          items: {
            create: [
              {
                description: input.description,
                quantity: 1,
                unitPrice: amount,
                total: amount,
                sortOrder: 0,
              },
            ],
          },
        },
        include: {
          client: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          items: true,
        },
      });

      const payment = await tx.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          amount,
          currency,
          method,
          provider: PaymentProvider.LOCAL,
          status: PaymentStatus.PAID,
          paidAt: now,
          metadata: input.metadata as Prisma.InputJsonValue,
        },
      });

      return { invoice, payment };
    });
  }

  /** Valida gift card: existe, activa, con saldo y no vencida. */
  async validateGiftCard(tenantId: string, code: string) {
    let normalized = code.trim().toUpperCase();
    if (normalized.startsWith('BBGC:')) {
      normalized = normalized.slice(5).trim();
    }
    if (!normalized) {
      throw new BadRequestException('Ingresa el código de la gift card.');
    }
    const gift = await this.prisma.giftCard.findFirst({
      where: { tenantId, code: normalized },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    if (!gift) {
      throw new NotFoundException('Gift card no encontrada.');
    }
    if (!gift.isActive) {
      throw new BadRequestException('Esta gift card está inactiva.');
    }
    if (gift.expiresAt && gift.expiresAt < new Date()) {
      throw new BadRequestException('Esta gift card está vencida.');
    }
    const balance = Number(gift.balance);
    if (balance <= 0) {
      throw new BadRequestException('Esta gift card no tiene saldo disponible.');
    }
    return {
      id: gift.id,
      code: gift.code,
      balance,
      initial: Number(gift.initial),
      expiresAt: gift.expiresAt,
      isActive: gift.isActive,
      client: gift.client,
      valid: true,
      message: `Saldo disponible: ${balance.toLocaleString('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      })}`,
    };
  }

  async markPaid(tenantId: string, id: string, dto: PayInvoiceDto) {
    const invoice = await this.one(tenantId, id);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('La factura está cancelada.');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('La factura ya está pagada.');
    }

    const total = Number(invoice.total);
    const now = new Date();
    const giftCode = dto.giftCardCode?.trim().toUpperCase();

    if (giftCode) {
      const giftInfo = await this.validateGiftCard(tenantId, giftCode);
      const giftApply = Math.min(giftInfo.balance, total);
      const remainder = Math.round((total - giftApply) * 100) / 100;

      const result = await this.prisma.$transaction(async (tx) => {
        const updatedGift = await tx.giftCard.updateMany({
          where: {
            id: giftInfo.id,
            tenantId,
            isActive: true,
            balance: { gte: giftApply },
          },
          data: {
            balance: { decrement: giftApply },
          },
        });
        if (!updatedGift.count) {
          throw new BadRequestException(
            'No se pudo canjear la gift card (saldo insuficiente o inactiva).',
          );
        }
        const giftAfter = await tx.giftCard.findUnique({
          where: { id: giftInfo.id },
        });
        if (giftAfter && Number(giftAfter.balance) <= 0) {
          await tx.giftCard.update({
            where: { id: giftInfo.id },
            data: { isActive: false, balance: 0 },
          });
        }

        await tx.payment.create({
          data: {
            tenantId,
            invoiceId: invoice.id,
            appointmentId: invoice.appointmentId,
            amount: giftApply,
            currency: invoice.currency,
            method: PaymentMethod.GIFT_CARD,
            provider: PaymentProvider.LOCAL,
            status: PaymentStatus.PAID,
            paidAt: now,
            metadata: {
              type: 'gift_card_redeem',
              giftCardId: giftInfo.id,
              code: giftInfo.code,
            },
          },
        });

        if (remainder > 0) {
          await tx.payment.create({
            data: {
              tenantId,
              invoiceId: invoice.id,
              appointmentId: invoice.appointmentId,
              amount: remainder,
              currency: invoice.currency,
              method: dto.method || PaymentMethod.CASH,
              provider: PaymentProvider.LOCAL,
              status: PaymentStatus.PAID,
              paidAt: now,
            },
          });
        }

        const updated = await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: InvoiceStatus.PAID,
            paidAt: now,
            metadata: {
              ...((invoice.metadata as Record<string, unknown>) || {}),
              giftCardCode: giftInfo.code,
              giftCardApplied: giftApply,
            } as Prisma.InputJsonValue,
          },
          include: {
            client: true,
            items: true,
            payments: true,
          },
        });

        return {
          invoice: updated,
          giftApplied: giftApply,
          remainder,
          giftCard: {
            code: giftInfo.code,
            remainingBalance: Math.max(0, giftInfo.balance - giftApply),
          },
        };
      });

      return result;
    }

    const amount = dto.amount != null ? Number(dto.amount) : total;

    const [payment, updated] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          appointmentId: invoice.appointmentId,
          amount,
          currency: invoice.currency,
          method: dto.method || PaymentMethod.CASH,
          provider: PaymentProvider.LOCAL,
          status: PaymentStatus.PAID,
          paidAt: now,
        },
      }),
      this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: now,
        },
        include: {
          client: true,
          items: true,
          payments: true,
        },
      }),
    ]);

    return { invoice: updated, payment };
  }

  async cancel(tenantId: string, id: string) {
    const invoice = await this.one(tenantId, id);
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException(
        'No puedes cancelar una factura ya pagada.',
      );
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      return invoice;
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
      include: { client: true, items: true },
    });
  }

  async summary(tenantId: string) {
    const { dayStart, dayEnd } = bogotaDayRange();
    const [issued, paid, cancelled, paidAgg, paidTodayRows] = await Promise.all([
      this.prisma.invoice.count({
        where: { tenantId, status: InvoiceStatus.ISSUED },
      }),
      this.prisma.invoice.count({
        where: { tenantId, status: InvoiceStatus.PAID },
      }),
      this.prisma.invoice.count({
        where: { tenantId, status: InvoiceStatus.CANCELLED },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: InvoiceStatus.PAID },
        _sum: { total: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          status: InvoiceStatus.PAID,
          OR: [
            { paidAt: { gte: dayStart, lte: dayEnd } },
            { paidAt: null, issuedAt: { gte: dayStart, lte: dayEnd } },
          ],
        },
        select: { total: true },
      }),
    ]);
    const paidToday = paidTodayRows.reduce((s, r) => s + Number(r.total), 0);
    return {
      issued,
      paid,
      cancelled,
      paidTotal: Number(paidAgg._sum.total || 0),
      paidToday,
      paidTodayCount: paidTodayRows.length,
    };
  }

  async htmlDocument(tenantId: string, id: string) {
    const invoice = await this.one(tenantId, id);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, address: true, city: true, phone: true },
    });
    const money = (n: unknown) =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: invoice.currency || 'COP',
        maximumFractionDigits: 0,
      }).format(Number(n || 0));
    const clientName = invoice.client
      ? `${invoice.client.firstName} ${invoice.client.lastName}`.trim()
      : 'Cliente';
    const rows = (invoice.items || [])
      .map(
        (it) =>
          `<tr><td>${it.description}</td><td>${it.quantity}</td><td>${money(it.unitPrice)}</td><td>${money(it.total)}</td></tr>`,
      )
      .join('');
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${invoice.number}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}h1{margin:0}</style></head>
<body>
<h1>${tenant?.name || 'BeautyBook'}</h1>
<p>${[tenant?.address, tenant?.city, tenant?.phone].filter(Boolean).join(' · ')}</p>
<h2>Factura ${invoice.number}</h2>
<p>Cliente: ${clientName}<br/>Fecha: ${invoice.issuedAt.toISOString().slice(0, 10)}<br/>Estado: ${invoice.status}</p>
<table><thead><tr><th>Descripción</th><th>Cant.</th><th>P. unit</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>Subtotal:</strong> ${money(invoice.subtotal)} · <strong>Impuesto:</strong> ${money(invoice.tax)} · <strong>Total:</strong> ${money(invoice.total)}</p>
${invoice.notes ? `<p>Notas: ${invoice.notes}</p>` : ''}
</body></html>`;
  }

  async sendWhatsApp(tenantId: string, id: string) {
    const invoice = await this.one(tenantId, id);
    const phone = invoice.client?.phone || invoice.client?.whatsapp;
    if (!phone) {
      throw new BadRequestException('El cliente no tiene teléfono/WhatsApp.');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const total = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: invoice.currency || 'COP',
      maximumFractionDigits: 0,
    }).format(Number(invoice.total));
    const lines = (invoice.items || [])
      .map((it) => `• ${it.description} x${it.quantity}`)
      .join('\n');
    const text = `🧾 *${tenant?.name || 'BeautyBook'}*\nFactura *${invoice.number}*\nEstado: ${invoice.status}\n\n${lines}\n\n*Total: ${total}*\nGracias por tu visita.`;
    await this.baileys.sendText(tenantId, phone, text);
    return { ok: true, phone, invoiceId: invoice.id };
  }
}
