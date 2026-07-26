import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

export type EpaycoCheckoutInput = {
  tenantId: string;
  tenantName: string;
  tenantEmail?: string | null;
  planId: string;
  planCode: string;
  planName: string;
  planDescription?: string | null;
  amount: number;
  currency: string;
  paymentId: string;
  invoice: string;
};

export type EpaycoConfirmation = {
  x_cust_id_cliente?: string;
  x_ref_payco?: string;
  x_transaction_id?: string;
  x_amount?: string;
  x_currency_code?: string;
  x_signature?: string;
  x_cod_response?: string | number;
  x_response?: string;
  x_response_reason_text?: string;
  x_id_invoice?: string;
  x_extra1?: string;
  x_extra2?: string;
  x_extra3?: string;
  x_test_request?: string;
  ref_payco?: string;
  [key: string]: unknown;
};

@Injectable()
export class EpaycoService {
  private readonly logger = new Logger(EpaycoService.name);
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.publicKey() &&
        this.privateKey() &&
        this.customerId() &&
        this.pKey(),
    );
  }

  publicKey() {
    return (
      this.config.get<string>('epayco.publicKey') ||
      process.env.EPAYCO_PUBLIC_KEY ||
      ''
    ).trim();
  }

  private privateKey() {
    return (
      this.config.get<string>('epayco.privateKey') ||
      process.env.EPAYCO_PRIVATE_KEY ||
      ''
    ).trim();
  }

  customerId() {
    return (
      this.config.get<string>('epayco.customerId') ||
      process.env.EPAYCO_P_CUST_ID_CLIENTE ||
      ''
    ).trim();
  }

  pKey() {
    return (
      this.config.get<string>('epayco.pKey') ||
      process.env.EPAYCO_P_KEY ||
      ''
    ).trim();
  }

  isTestMode() {
    const v = (
      this.config.get<string>('epayco.test') ||
      process.env.EPAYCO_TEST ||
      'true'
    ).toLowerCase();
    return v !== 'false' && v !== '0';
  }

  appUrl() {
    return (
      this.config.get<string>('app.url') ||
      process.env.APP_URL ||
      process.env.WEB_URL ||
      process.env.FRONTEND_URL ||
      'http://localhost:5173'
    ).replace(/\/$/, '');
  }

  apiUrl() {
    return (
      this.config.get<string>('app.apiUrl') ||
      process.env.API_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  confirmationUrl() {
    return (
      process.env.EPAYCO_CONFIRMATION_URL ||
      `${this.apiUrl()}/api/v1/payments/epayco/confirmation`
    );
  }

  responseUrl() {
    return (
      process.env.EPAYCO_RESPONSE_URL ||
      `${this.appUrl()}/app/settings?tab=planes&epayco=return`
    );
  }

  private async login(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }
    const publicKey = this.publicKey();
    const privateKey = this.privateKey();
    if (!publicKey || !privateKey) {
      throw new ServiceUnavailableException(
        'Faltan EPAYCO_PUBLIC_KEY / EPAYCO_PRIVATE_KEY.',
      );
    }
    const basic = Buffer.from(`${publicKey}:${privateKey}`).toString('base64');
    const res = await fetch('https://apify.epayco.co/login', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ public_key: publicKey }),
    });
    const json = (await res.json().catch(() => null)) as {
      token?: string;
      textResponse?: string;
      message?: string;
    } | null;
    if (!res.ok || !json?.token) {
      throw new BadRequestException(
        json?.textResponse ||
          json?.message ||
          `No se pudo autenticar con ePayco (${res.status}).`,
      );
    }
    this.tokenCache = {
      token: json.token,
      expiresAt: Date.now() + 50 * 60_000,
    };
    return json.token;
  }

  async createCheckoutSession(input: EpaycoCheckoutInput) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'ePayco no está configurado. Agrega EPAYCO_PUBLIC_KEY, EPAYCO_PRIVATE_KEY, EPAYCO_P_CUST_ID_CLIENTE y EPAYCO_P_KEY.',
      );
    }

    const token = await this.login();
    const amount = Math.round(Number(input.amount));
    const body = {
      name: `BeautyBook — ${input.planName}`,
      description:
        input.planDescription ||
        `Suscripción mensual plan ${input.planCode}`,
      invoice: input.invoice,
      currency: (input.currency || 'COP').toUpperCase(),
      amount,
      taxBase: amount,
      tax: 0,
      taxIco: 0,
      country: 'CO',
      lang: 'ES',
      confirmation: this.confirmationUrl(),
      response: this.responseUrl(),
      methodConfirm: 'POST',
      billing: {
        email: input.tenantEmail || undefined,
        name: input.tenantName,
      },
      extras: {
        extra1: input.paymentId,
        extra2: input.tenantId,
        extra3: input.planId,
      },
      test: this.isTestMode(),
      checkout_version: '2',
    };

    const res = await fetch('https://apify.epayco.co/payment/session/create', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { sessionId?: string; token?: string };
      sessionId?: string;
      textResponse?: string;
      message?: string;
    } | null;

    const sessionId = json?.data?.sessionId || json?.sessionId;
    if (!res.ok || !sessionId) {
      this.logger.error(`ePayco session error: ${JSON.stringify(json)}`);
      throw new BadRequestException(
        json?.textResponse ||
          json?.message ||
          `No se pudo crear la sesión ePayco (${res.status}).`,
      );
    }

    this.logger.log(
      `Sesión ePayco ${sessionId} tenant=${input.tenantId} plan=${input.planCode} amount=${amount}`,
    );

    return {
      sessionId,
      publicKey: this.publicKey(),
      test: this.isTestMode(),
      invoice: input.invoice,
    };
  }

  validateSignature(data: EpaycoConfirmation) {
    const cust = this.customerId();
    const key = this.pKey();
    const ref = String(data.x_ref_payco || '');
    const tx = String(data.x_transaction_id || '');
    const amount = String(data.x_amount || '');
    const currency = String(data.x_currency_code || '');
    const expected = String(data.x_signature || '').toLowerCase();
    if (!cust || !key || !ref || !tx || !amount || !currency || !expected) {
      return false;
    }
    const calculated = createHash('sha256')
      .update(`${cust}^${key}^${ref}^${tx}^${amount}^${currency}`)
      .digest('hex')
      .toLowerCase();
    return calculated === expected;
  }

  isApproved(data: EpaycoConfirmation) {
    const cod = Number(data.x_cod_response);
    const text = String(data.x_response || '').toLowerCase();
    return cod === 1 || text === 'aceptada' || text === 'accepted';
  }

  async getTransactionByRef(refPayco: string) {
    const res = await fetch(
      `https://secure.epayco.co/validation/v1/reference/${encodeURIComponent(refPayco)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
    );
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: EpaycoConfirmation & { x_cod_transaction_state?: string };
      textResponse?: string;
    } | null;
    if (!res.ok || !json?.data) {
      throw new BadRequestException(
        json?.textResponse ||
          `No se pudo consultar la referencia ePayco ${refPayco}`,
      );
    }
    return json.data;
  }
}
