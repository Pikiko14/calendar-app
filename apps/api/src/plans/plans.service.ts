import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import {
  PaymentProvider,
  PaymentStatus,
  SubscriptionStatus,
  TenantPlan,
  TenantStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EpaycoService,
  type EpaycoConfirmation,
} from '../payments/epayco.service';

export const PLAN_SEEDS = [
  {
    id: 'plan_basico',
    code: 'BASICO',
    name: 'Básico',
    description:
      'Ideal para empezar: pocos estilistas y servicios esenciales.',
    priceMonthly: 25_000,
    maxWorkers: 2,
    maxServices: 5,
    maxBranches: 1,
    whatsappEnabled: true,
    aiEnabled: false,
    features: [
      '2 estilistas',
      '5 servicios',
      '1 sede',
      'Bot WhatsApp',
      'Calendario y reservas online',
    ],
    sortOrder: 1,
  },
  {
    id: 'plan_pro',
    code: 'PRO',
    name: 'Profesional',
    description: 'Para negocios en crecimiento con más equipo y catálogo.',
    priceMonthly: 50_000,
    maxWorkers: 8,
    maxServices: 25,
    maxBranches: 3,
    whatsappEnabled: true,
    aiEnabled: true,
    features: [
      '8 estilistas',
      '25 servicios',
      'Hasta 3 sedes',
      'Bot WhatsApp',
      'FAQ con IA',
      'Reportes',
    ],
    sortOrder: 2,
  },
  {
    id: 'plan_ilimitado',
    code: 'ILIMITADO',
    name: 'Ilimitado',
    description:
      'Todo sin límites para cadenas y negocios de alto volumen.',
    priceMonthly: 80_000,
    maxWorkers: null as number | null,
    maxServices: null as number | null,
    maxBranches: null as number | null,
    whatsappEnabled: true,
    aiEnabled: true,
    features: [
      'Estilistas ilimitados',
      'Servicios ilimitados',
      'Sedes ilimitadas',
      'Bot WhatsApp',
      'FAQ con IA',
      'Soporte prioritario',
    ],
    sortOrder: 3,
  },
] as const;

function planCodeToTenantPlan(code: string): TenantPlan {
  if (code === 'ILIMITADO' || code === 'ENTERPRISE') return TenantPlan.ENTERPRISE;
  if (code === 'PRO') return TenantPlan.PRO;
  return TenantPlan.STARTER;
}

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EpaycoService))
    private readonly epayco: EpaycoService,
  ) {}

  async onModuleInit() {
    await this.ensurePlans();
    await this.ensureTheBarberShopSubscription();
  }

  async ensurePlans() {
    for (const seed of PLAN_SEEDS) {
      await this.prisma.plan.upsert({
        where: { code: seed.code },
        create: {
          id: seed.id,
          code: seed.code,
          name: seed.name,
          description: seed.description,
          priceMonthly: seed.priceMonthly,
          maxWorkers: seed.maxWorkers,
          maxServices: seed.maxServices,
          maxBranches: seed.maxBranches,
          whatsappEnabled: seed.whatsappEnabled,
          aiEnabled: seed.aiEnabled,
          features: [...seed.features],
          sortOrder: seed.sortOrder,
          isActive: true,
        },
        update: {
          name: seed.name,
          description: seed.description,
          priceMonthly: seed.priceMonthly,
          maxWorkers: seed.maxWorkers,
          maxServices: seed.maxServices,
          maxBranches: seed.maxBranches,
          whatsappEnabled: seed.whatsappEnabled,
          aiEnabled: seed.aiEnabled,
          features: [...seed.features],
          sortOrder: seed.sortOrder,
          isActive: true,
        },
      });
    }
  }

  /** Activa 1 suscripción Ilimitada para The barber shop. */
  async ensureTheBarberShopSubscription() {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { slug: 'the-barber-shop' },
          { name: { equals: 'The barber shop', mode: 'insensitive' } },
          { name: { equals: 'The Barber Shop', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) return;

    await this.activateSubscription(tenant.id, 'ILIMITADO', {
      notes: 'Suscripción manual inicial — The barber shop',
    });
    this.logger.log(
      `Suscripción ILIMITADO activa: ${tenant.name} (${tenant.slug})`,
    );
  }

  list() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getPlanByCode(code: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado.');
    return plan;
  }

  isSubscriptionActive(sub: {
    status: SubscriptionStatus;
    endsAt: Date | null;
  } | null): boolean {
    if (!sub) return false;
    if (
      sub.status !== SubscriptionStatus.ACTIVE &&
      sub.status !== SubscriptionStatus.TRIAL
    ) {
      return false;
    }
    if (sub.endsAt && sub.endsAt.getTime() < Date.now()) return false;
    return true;
  }

  async getSubscription(tenantId: string) {
    return this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
  }

  async hasActiveSubscription(tenantId: string) {
    const sub = await this.getSubscription(tenantId);
    return this.isSubscriptionActive(sub);
  }

  async assertActiveSubscription(tenantId: string) {
    const ok = await this.hasActiveSubscription(tenantId);
    if (!ok) {
      throw new ForbiddenException(
        'Necesitas una suscripción activa para usar la app. Elige un plan en Ajustes → Planes.',
      );
    }
  }

  async activateSubscription(
    tenantId: string,
    planCodeOrId: string,
    opts?: {
      notes?: string;
      endsAt?: Date | null;
      stripeCustomerId?: string | null;
      stripeSubscriptionId?: string | null;
    },
  ) {
    let plan = await this.prisma.plan.findFirst({
      where: {
        OR: [{ id: planCodeOrId }, { code: planCodeOrId.toUpperCase() }],
        isActive: true,
      },
    });
    if (!plan) {
      await this.ensurePlans();
      plan = await this.prisma.plan.findFirst({
        where: {
          OR: [{ id: planCodeOrId }, { code: planCodeOrId.toUpperCase() }],
          isActive: true,
        },
      });
    }
    if (!plan) throw new NotFoundException('Plan no encontrado.');

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        planId: plan.id,
        plan: planCodeToTenantPlan(plan.code),
        status: TenantStatus.ACTIVE,
      },
    });

    return this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        endsAt: opts?.endsAt ?? null,
        notes: opts?.notes,
        stripeCustomerId: opts?.stripeCustomerId ?? undefined,
        stripeSubscriptionId: opts?.stripeSubscriptionId ?? undefined,
      },
      update: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        endsAt: opts?.endsAt ?? null,
        notes: opts?.notes,
        ...(opts?.stripeCustomerId !== undefined
          ? { stripeCustomerId: opts.stripeCustomerId }
          : {}),
        ...(opts?.stripeSubscriptionId !== undefined
          ? { stripeSubscriptionId: opts.stripeSubscriptionId }
          : {}),
      },
      include: { plan: true },
    });
  }

  async resolvePlan(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: {
        planRef: true,
        subscription: { include: { plan: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Negocio no encontrado.');

    const subActive = this.isSubscriptionActive(tenant.subscription);
    const plan = tenant.subscription?.plan || tenant.planRef;
    return { tenant, plan, subscription: tenant.subscription, subActive };
  }

  async getUsage(tenantId: string) {
    const { plan, subscription, subActive } = await this.resolvePlan(tenantId);
    const [workers, services, branches] = await Promise.all([
      this.prisma.worker.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.service.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.branch.count({ where: { tenantId, deletedAt: null } }),
    ]);

    return {
      subscriptionActive: subActive,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
          }
        : null,
      plan,
      usage: { workers, services, branches },
      limits: {
        maxWorkers: plan?.maxWorkers ?? null,
        maxServices: plan?.maxServices ?? null,
        maxBranches: plan?.maxBranches ?? null,
        whatsappEnabled: plan?.whatsappEnabled ?? false,
        aiEnabled: plan?.aiEnabled ?? false,
      },
    };
  }

  private async assertPlanFitsUsage(tenantId: string, planId: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado.');

    const usage = await this.getUsage(tenantId);
    if (plan.maxWorkers != null && usage.usage.workers > plan.maxWorkers) {
      throw new BadRequestException(
        `No puedes elegir ${plan.name}: tienes ${usage.usage.workers} estilistas y el plan permite ${plan.maxWorkers}.`,
      );
    }
    if (plan.maxServices != null && usage.usage.services > plan.maxServices) {
      throw new BadRequestException(
        `No puedes elegir ${plan.name}: tienes ${usage.usage.services} servicios y el plan permite ${plan.maxServices}.`,
      );
    }
    if (plan.maxBranches != null && usage.usage.branches > plan.maxBranches) {
      throw new BadRequestException(
        `No puedes elegir ${plan.name}: tienes ${usage.usage.branches} sedes y el plan permite ${plan.maxBranches}.`,
      );
    }
    return plan;
  }

  /**
   * Inicia checkout de suscripción con ePayco Smart Checkout.
   * Sin llaves → modo demo (confirmar manualmente).
   */
  async checkout(tenantId: string, planId: string) {
    const plan = await this.assertPlanFitsUsage(tenantId, planId);
    const amount = Number(plan.priceMonthly);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, email: true, currency: true },
    });
    const currency = (tenant.currency || 'COP').toUpperCase();
    const ready = this.epayco.isConfigured();

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        planId: plan.id,
        plan: planCodeToTenantPlan(plan.code),
      },
    });

    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.PAST_DUE,
        startsAt: new Date(),
        notes: ready
          ? 'Checkout ePayco pendiente'
          : 'Checkout demo pendiente (sin llaves ePayco)',
      },
      update: {
        planId: plan.id,
        status: SubscriptionStatus.PAST_DUE,
        notes: ready
          ? 'Checkout ePayco pendiente'
          : 'Checkout demo pendiente (sin llaves ePayco)',
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        amount,
        currency,
        status: PaymentStatus.PENDING,
        method: 'EPAYCO',
        provider: PaymentProvider.EPAYCO,
        metadata: {
          type: 'subscription',
          planId: plan.id,
          planCode: plan.code,
          planName: plan.name,
        },
      },
    });

    if (!ready) {
      const publicBase = this.epayco.appUrl();
      return {
        paymentId: payment.id,
        amount,
        currency,
        provider: 'EPAYCO' as const,
        plan: { id: plan.id, code: plan.code, name: plan.name },
        checkoutUrl: `${publicBase}/app/settings?tab=planes&pay=${payment.id}`,
        sessionId: null as string | null,
        publicKey: null as string | null,
        test: true,
        demoMode: true,
        configured: false,
        message: 'Modo demo: puedes simular el pago.',
      };
    }

    const invoice = `BB-${payment.id.slice(-10).toUpperCase()}`;
    const session = await this.epayco.createCheckoutSession({
      tenantId,
      tenantName: tenant.name,
      tenantEmail: tenant.email,
      planId: plan.id,
      planCode: plan.code,
      planName: plan.name,
      planDescription: plan.description,
      amount,
      currency,
      paymentId: payment.id,
      invoice,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerRef: session.sessionId,
        metadata: {
          type: 'subscription',
          planId: plan.id,
          planCode: plan.code,
          planName: plan.name,
          epaycoSessionId: session.sessionId,
          invoice,
        },
      },
    });

    return {
      paymentId: payment.id,
      amount,
      currency,
      provider: 'EPAYCO' as const,
      plan: { id: plan.id, code: plan.code, name: plan.name },
      checkoutUrl: null as string | null,
      sessionId: session.sessionId,
      publicKey: session.publicKey,
      test: session.test,
      demoMode: false,
      configured: true,
      message: 'Abre el checkout ePayco con sessionId.',
    };
  }

  async confirmCheckout(tenantId: string, paymentId: string) {
    if (this.epayco.isConfigured()) {
      throw new BadRequestException(
        'Con ePayco configurado la activación ocurre por URL de confirmación o sync de ref_payco.',
      );
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado.');
    const meta = (payment.metadata || {}) as { type?: string; planId?: string };
    if (meta.type !== 'subscription' || !meta.planId) {
      throw new BadRequestException('Este pago no es de suscripción.');
    }
    if (payment.status === PaymentStatus.PAID) {
      return this.getUsage(tenantId);
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.PAID, paidAt: new Date() },
    });

    const sub = await this.activateSubscription(tenantId, meta.planId, {
      notes: `Demo / sin ePayco (${payment.id})`,
      endsAt: new Date(Date.now() + 30 * 86400000),
    });

    return {
      ...sub,
      payment: { id: payment.id, status: 'PAID', amount: payment.amount },
      tenant: await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { planRef: true },
      }),
    };
  }

  /** Tras response URL de ePayco (?ref_payco=...). */
  async syncEpaycoRef(tenantId: string, refPayco: string) {
    if (!this.epayco.isConfigured()) {
      throw new BadRequestException('ePayco no está configurado.');
    }
    const data = await this.epayco.getTransactionByRef(refPayco);
    const extra2 = String(data.x_extra2 || '');
    if (extra2 && extra2 !== tenantId) {
      throw new ForbiddenException('La transacción no pertenece a este negocio.');
    }
    await this.applyEpaycoConfirmation(data, { requireSignature: false });
    return this.getUsage(tenantId);
  }

  async handleEpaycoConfirmation(data: EpaycoConfirmation) {
    await this.applyEpaycoConfirmation(data, { requireSignature: true });
  }

  private async applyEpaycoConfirmation(
    data: EpaycoConfirmation,
    opts: { requireSignature: boolean },
  ) {
    if (opts.requireSignature) {
      if (!this.epayco.validateSignature(data)) {
        this.logger.warn(
          `Firma ePayco inválida ref=${data.x_ref_payco} tx=${data.x_transaction_id}`,
        );
        throw new BadRequestException('Firma ePayco inválida.');
      }
    }

    const paymentId = String(data.x_extra1 || '');
    const tenantId = String(data.x_extra2 || '');
    const planId = String(data.x_extra3 || '');
    const ref = String(data.x_ref_payco || data.ref_payco || '');

    if (!this.epayco.isApproved(data)) {
      this.logger.log(
        `ePayco no aprobada ref=${ref} response=${data.x_response} cod=${data.x_cod_response}`,
      );
      if (paymentId) {
        await this.prisma.payment.updateMany({
          where: { id: paymentId, status: PaymentStatus.PENDING },
          data: {
            status: PaymentStatus.FAILED,
            providerRef: ref || undefined,
            metadata: JSON.parse(
              JSON.stringify({
                type: 'subscription',
                epayco: data,
              }),
            ),
          },
        });
      }
      return;
    }

    let payment = paymentId
      ? await this.prisma.payment.findFirst({ where: { id: paymentId } })
      : null;
    if (!payment && ref) {
      payment = await this.prisma.payment.findFirst({
        where: { providerRef: ref },
      });
    }
    if (!payment && data.x_id_invoice) {
      payment = await this.prisma.payment.findFirst({
        where: {
          metadata: { path: ['invoice'], equals: String(data.x_id_invoice) },
        },
      });
    }

    const resolvedTenantId = tenantId || payment?.tenantId;
    const meta = (payment?.metadata || {}) as { planId?: string; type?: string };
    const resolvedPlanId = planId || meta.planId;
    if (!resolvedTenantId || !resolvedPlanId) {
      this.logger.warn(`Confirmación ePayco incompleta ref=${ref}`);
      return;
    }

    if (payment?.status === PaymentStatus.PAID) {
      return;
    }

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.PAID,
          paidAt: new Date(),
          providerRef: ref || payment.providerRef,
          method: 'EPAYCO',
          provider: PaymentProvider.EPAYCO,
        },
      });
    }

    await this.activateSubscription(resolvedTenantId, resolvedPlanId, {
      notes: `ePayco ${ref || data.x_transaction_id}`,
      endsAt: new Date(Date.now() + 30 * 86400000),
    });

    this.logger.log(
      `Suscripción activada tenant=${resolvedTenantId} plan=${resolvedPlanId} ref=${ref}`,
    );
  }

  /** Compat: inicia checkout (ya no activa sin pago). */
  async selectPlan(tenantId: string, planId: string) {
    return this.checkout(tenantId, planId);
  }

  async assertCanCreateWorker(tenantId: string) {
    await this.assertActiveSubscription(tenantId);
    const { plan, usage } = await this.getUsage(tenantId);
    if (!plan) throw new ForbiddenException('Sin plan activo.');
    if (plan.maxWorkers != null && usage.workers >= plan.maxWorkers) {
      throw new BadRequestException(
        `Tu plan ${plan.name} permite máximo ${plan.maxWorkers} estilistas. Mejora tu plan para agregar más.`,
      );
    }
  }

  async assertCanCreateService(tenantId: string) {
    await this.assertActiveSubscription(tenantId);
    const { plan, usage } = await this.getUsage(tenantId);
    if (!plan) throw new ForbiddenException('Sin plan activo.');
    if (plan.maxServices != null && usage.services >= plan.maxServices) {
      throw new BadRequestException(
        `Tu plan ${plan.name} permite máximo ${plan.maxServices} servicios. Mejora tu plan para agregar más.`,
      );
    }
  }

  async assertCanCreateBranch(tenantId: string) {
    await this.assertActiveSubscription(tenantId);
    const { plan, usage } = await this.getUsage(tenantId);
    if (!plan) throw new ForbiddenException('Sin plan activo.');
    if (plan.maxBranches != null && usage.branches >= plan.maxBranches) {
      throw new BadRequestException(
        `Tu plan ${plan.name} permite máximo ${plan.maxBranches} sedes. Mejora tu plan para agregar más.`,
      );
    }
  }

  async assertWhatsappAllowed(tenantId: string) {
    await this.assertActiveSubscription(tenantId);
    const { plan } = await this.resolvePlan(tenantId);
    if (!plan?.whatsappEnabled) {
      throw new ForbiddenException(
        'Tu plan no incluye WhatsApp. Mejora a Profesional o Ilimitado.',
      );
    }
  }

  async assertAiAllowed(tenantId: string) {
    await this.assertActiveSubscription(tenantId);
    const { plan } = await this.resolvePlan(tenantId);
    if (!plan?.aiEnabled) {
      throw new ForbiddenException(
        'Tu plan no incluye FAQ con IA. Mejora a Profesional o Ilimitado.',
      );
    }
  }
}
