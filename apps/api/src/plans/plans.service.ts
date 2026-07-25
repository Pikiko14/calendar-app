import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { TenantPlan } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensurePlans();
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

    // Tenants sin planId → Básico
    const basico = await this.prisma.plan.findUnique({
      where: { code: 'BASICO' },
    });
    if (basico) {
      await this.prisma.tenant.updateMany({
        where: { planId: null },
        data: { planId: basico.id, plan: TenantPlan.STARTER },
      });
    }
  }

  list() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getDefaultPlanId() {
    const basico = await this.prisma.plan.findUnique({
      where: { code: 'BASICO' },
    });
    if (!basico) {
      await this.ensurePlans();
      const again = await this.prisma.plan.findUnique({
        where: { code: 'BASICO' },
      });
      if (!again) throw new Error('Plan Básico no disponible.');
      return again.id;
    }
    return basico.id;
  }

  async resolvePlan(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: { planRef: true },
    });
    if (!tenant) throw new NotFoundException('Negocio no encontrado.');

    if (tenant.planRef) return { tenant, plan: tenant.planRef };

    const planId = await this.getDefaultPlanId();
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { planId, plan: TenantPlan.STARTER },
      include: { planRef: true },
    });
    if (!updated.planRef) {
      throw new NotFoundException('Plan no encontrado.');
    }
    return { tenant: updated, plan: updated.planRef };
  }

  async getUsage(tenantId: string) {
    const { plan } = await this.resolvePlan(tenantId);
    const [workers, services, branches] = await Promise.all([
      this.prisma.worker.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.service.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.branch.count({ where: { tenantId, deletedAt: null } }),
    ]);

    return {
      plan,
      usage: {
        workers,
        services,
        branches,
      },
      limits: {
        maxWorkers: plan.maxWorkers,
        maxServices: plan.maxServices,
        maxBranches: plan.maxBranches,
      },
    };
  }

  async selectPlan(tenantId: string, planId: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId, isActive: true },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado.');

    const usage = await this.getUsage(tenantId);
    if (
      plan.maxWorkers != null &&
      usage.usage.workers > plan.maxWorkers
    ) {
      throw new BadRequestException(
        `No puedes bajar a ${plan.name}: tienes ${usage.usage.workers} estilistas y el plan permite ${plan.maxWorkers}.`,
      );
    }
    if (
      plan.maxServices != null &&
      usage.usage.services > plan.maxServices
    ) {
      throw new BadRequestException(
        `No puedes bajar a ${plan.name}: tienes ${usage.usage.services} servicios y el plan permite ${plan.maxServices}.`,
      );
    }
    if (
      plan.maxBranches != null &&
      usage.usage.branches > plan.maxBranches
    ) {
      throw new BadRequestException(
        `No puedes bajar a ${plan.name}: tienes ${usage.usage.branches} sedes y el plan permite ${plan.maxBranches}.`,
      );
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        planId: plan.id,
        plan: planCodeToTenantPlan(plan.code),
      },
      include: { planRef: true },
    });
  }

  async assertCanCreateWorker(tenantId: string) {
    const { plan, usage } = await this.getUsage(tenantId);
    if (plan.maxWorkers != null && usage.workers >= plan.maxWorkers) {
      throw new BadRequestException(
        `Tu plan ${plan.name} permite máximo ${plan.maxWorkers} estilistas. Mejora tu plan para agregar más.`,
      );
    }
  }

  async assertCanCreateService(tenantId: string) {
    const { plan, usage } = await this.getUsage(tenantId);
    if (plan.maxServices != null && usage.services >= plan.maxServices) {
      throw new BadRequestException(
        `Tu plan ${plan.name} permite máximo ${plan.maxServices} servicios. Mejora tu plan para agregar más.`,
      );
    }
  }

  async assertCanCreateBranch(tenantId: string) {
    const { plan, usage } = await this.getUsage(tenantId);
    if (plan.maxBranches != null && usage.branches >= plan.maxBranches) {
      throw new BadRequestException(
        `Tu plan ${plan.name} permite máximo ${plan.maxBranches} sedes. Mejora tu plan para agregar más.`,
      );
    }
  }
}
