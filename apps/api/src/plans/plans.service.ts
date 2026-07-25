import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  SubscriptionStatus,
  TenantPlan,
  TenantStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

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
    opts?: { notes?: string; endsAt?: Date | null },
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
      },
      update: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        endsAt: opts?.endsAt ?? null,
        notes: opts?.notes,
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

  async selectPlan(tenantId: string, planId: string) {
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

    const sub = await this.activateSubscription(tenantId, plan.id, {
      notes: 'Activada desde la app',
    });
    return {
      ...sub,
      tenant: await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { planRef: true },
      }),
    };
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
