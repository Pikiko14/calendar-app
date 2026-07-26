import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalPaymentDto } from './dto/payment.dto';
import { StripeService } from './stripe.service';
import { EpaycoService } from './epayco.service';

@Injectable()
export class PaymentsService {
  constructor(
    private p: PrismaService,
    private readonly stripe: StripeService,
    private readonly epayco: EpaycoService,
  ) {}

  local(t: string, d: LocalPaymentDto) {
    return this.p.payment.create({
      data: {
        tenantId: t,
        appointmentId: d.appointmentId,
        amount: d.amount,
        method: d.method,
        provider: d.provider ?? 'LOCAL',
        status: 'PAID',
        paidAt: new Date(),
      },
    });
  }

  provider(provider: string) {
    if (provider === 'Epayco' || provider === 'EPAYCO') {
      const configured = this.epayco.isConfigured();
      return {
        provider: 'EPAYCO',
        status: configured ? 'READY' : 'PENDING_CONFIGURATION',
        configured,
        test: this.epayco.isTestMode(),
        webhookPath: '/api/v1/payments/epayco/confirmation',
        message: configured
          ? 'ePayco listo para cobrar suscripciones.'
          : 'ePayco pendiente de configuración.',
      };
    }
    if (provider === 'Stripe') {
      const configured = this.stripe.isConfigured();
      return {
        provider: 'STRIPE',
        status: configured ? 'READY' : 'PENDING_CONFIGURATION',
        configured,
        webhookPath: '/api/v1/payments/stripe/webhook',
        message: configured
          ? 'Stripe listo (legacy).'
          : 'Stripe no configurado.',
      };
    }
    return {
      provider,
      status: 'PENDING_CONFIGURATION',
      message: `Integración de ${provider} pendiente de credenciales.`,
    };
  }
}
