import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export type StripeCheckoutInput = {
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
  customerId?: string | null;
};

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.getSecretKey());
  }

  private getSecretKey() {
    return (
      this.config.get<string>('stripe.secretKey') ||
      process.env.STRIPE_SECRET_KEY ||
      ''
    ).trim();
  }

  private getWebhookSecret() {
    return (
      this.config.get<string>('stripe.webhookSecret') ||
      process.env.STRIPE_WEBHOOK_SECRET ||
      ''
    ).trim();
  }

  getClient(): Stripe {
    const key = this.getSecretKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'Stripe no está configurado. Agrega STRIPE_SECRET_KEY.',
      );
    }
    if (!this.client) {
      this.client = new Stripe(key, {
        apiVersion: '2025-08-27.basil',
        typescript: true,
      });
    }
    return this.client;
  }

  /** COP es moneda de cero decimales en Stripe. */
  toStripeAmount(amount: number, currency: string) {
    const cur = currency.toLowerCase();
    const zeroDecimal = new Set([
      'cop',
      'jpy',
      'krw',
      'clp',
      'vnd',
      'xaf',
      'xof',
    ]);
    const n = Math.round(Number(amount));
    if (zeroDecimal.has(cur)) return n;
    return Math.round(n * 100);
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

  async createSubscriptionCheckout(input: StripeCheckoutInput) {
    const stripe = this.getClient();
    const currency = (input.currency || 'COP').toLowerCase();
    const unitAmount = this.toStripeAmount(input.amount, currency);
    const successUrl =
      process.env.STRIPE_SUCCESS_URL ||
      `${this.appUrl()}/app/settings?tab=planes&stripe=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      process.env.STRIPE_CANCEL_URL ||
      `${this.appUrl()}/app/settings?tab=planes&stripe=cancel`;

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: input.tenantId,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            recurring: { interval: 'month' },
            product_data: {
              name: `BeautyBook — ${input.planName}`,
              description:
                input.planDescription ||
                `Suscripción mensual plan ${input.planCode}`,
              metadata: {
                planId: input.planId,
                planCode: input.planCode,
              },
            },
          },
        },
      ],
      metadata: {
        type: 'subscription',
        tenantId: input.tenantId,
        planId: input.planId,
        planCode: input.planCode,
        paymentId: input.paymentId,
      },
      subscription_data: {
        metadata: {
          type: 'subscription',
          tenantId: input.tenantId,
          planId: input.planId,
          planCode: input.planCode,
          paymentId: input.paymentId,
        },
      },
    };

    if (input.customerId) {
      params.customer = input.customerId;
    } else if (input.tenantEmail) {
      params.customer_email = input.tenantEmail;
    }

    const session = await stripe.checkout.sessions.create(params);
    if (!session.url) {
      throw new BadRequestException('Stripe no devolvió URL de checkout.');
    }

    this.logger.log(
      `Checkout session ${session.id} tenant=${input.tenantId} plan=${input.planCode}`,
    );

    return {
      sessionId: session.id,
      url: session.url,
      customerId:
        typeof session.customer === 'string' ? session.customer : null,
    };
  }

  constructEvent(rawBody: Buffer, signature: string) {
    const secret = this.getWebhookSecret();
    if (!secret) {
      throw new ServiceUnavailableException(
        'Falta STRIPE_WEBHOOK_SECRET para validar webhooks.',
      );
    }
    return this.getClient().webhooks.constructEvent(
      rawBody,
      signature,
      secret,
    );
  }

  async retrieveCheckoutSession(sessionId: string) {
    return this.getClient().checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });
  }
}
