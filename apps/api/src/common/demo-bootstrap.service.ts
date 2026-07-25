import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DayOfWeek, TenantPlan, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_WEEK_BLOCKS } from './schedule.util';

const DEMO_SLUG = 'barberia-premium';

/**
 * Garantiza el tenant demo en producción (Railway no corre `prisma db seed`).
 * Idempotente: si ya existe, no hace nada.
 */
@Injectable()
export class DemoBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DemoBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureDemoTenant();
    } catch (e) {
      this.logger.warn(
        `No se pudo crear el portal demo: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async ensureDemoTenant() {
    const existing = await this.prisma.tenant.findFirst({
      where: { slug: DEMO_SLUG, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      // Asegurar que sea reservable públicamente
      await this.prisma.tenant.update({
        where: { id: existing.id },
        data: { status: TenantStatus.ACTIVE },
      });
      await this.prisma.tenantSettings.upsert({
        where: { tenantId: existing.id },
        create: { tenantId: existing.id, allowOnlineBooking: true },
        update: { allowOnlineBooking: true },
      });
      this.logger.log(`Portal demo OK: /${DEMO_SLUG}`);
      return;
    }

    this.logger.log(`Creando portal demo /${DEMO_SLUG}…`);

    const plan =
      (await this.prisma.plan.findUnique({ where: { code: 'ILIMITADO' } })) ||
      (await this.prisma.plan.findUnique({ where: { code: 'BASICO' } }));

    const passwordHash = await bcrypt.hash('Admin12345!', 12);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: 'Barbería Premium',
        slug: DEMO_SLUG,
        email: 'admin@barberiapremium.test',
        phone: '+573001112233',
        address: 'Calle 100 #15-20',
        city: 'Bogotá',
        country: 'CO',
        mapUrl: 'https://maps.google.com/?q=Bogota',
        primaryColor: '#0F766E',
        status: TenantStatus.ACTIVE,
        plan: plan?.code === 'ILIMITADO' ? TenantPlan.ENTERPRISE : TenantPlan.STARTER,
        ...(plan ? { planId: plan.id } : {}),
        settings: {
          create: {
            allowOnlineBooking: true,
            minBookingNoticeMinutes: 60,
            maxBookingDaysAhead: 60,
            bufferCleanMinutes: 5,
            reminderHoursBefore: 24,
            reminder2HoursBefore: true,
            reviewRequestEnabled: true,
            waitlistEnabled: true,
            loyaltyEnabled: true,
            bookingPageTitle: 'Barbería Premium',
            bookingPageSubtitle: 'Portal demo BeautyBook',
          },
        },
        whatsappBot: {
          create: {
            enabled: false,
            businessName: 'Barbería Premium',
          },
        },
        loyaltyProgram: { create: {} },
      },
    });

    await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@barberiapremium.test',
        passwordHash,
        firstName: 'Admin',
        lastName: 'Premium',
        role: 'ADMIN',
      },
    });

    const branch = await this.prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Sede Principal',
        slug: 'principal',
        isMain: true,
        address: 'Calle 100 #15-20',
        city: 'Bogotá',
      },
    });

    for (const [dayOfWeek, conf] of Object.entries(DEFAULT_WEEK_BLOCKS)) {
      await this.prisma.branchSchedule.create({
        data: {
          branchId: branch.id,
          dayOfWeek: dayOfWeek as DayOfWeek,
          isClosed: conf.isClosed,
          blocks: {
            create: conf.blocks.map((b, i) => ({ ...b, sortOrder: i })),
          },
        },
      });
    }

    const category = await this.prisma.serviceCategory.create({
      data: { tenantId: tenant.id, name: 'Caballero', color: '#0F766E' },
    });

    const serviceDefs = [
      { name: 'Corte Caballero', durationMinutes: 30, price: 35000 },
      { name: 'Barba', durationMinutes: 20, price: 20000 },
      { name: 'Corte + Barba', durationMinutes: 45, price: 50000 },
    ];

    const services = [];
    for (const def of serviceDefs) {
      services.push(
        await this.prisma.service.create({
          data: {
            tenantId: tenant.id,
            categoryId: category.id,
            name: def.name,
            durationMinutes: def.durationMinutes,
            price: def.price,
            cleanMinutes: 5,
            color: '#0F766E',
          },
        }),
      );
    }

    const worker = await this.prisma.worker.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        firstName: 'Carlos',
        lastName: 'López',
        specialties: ['Corte', 'Barba'],
        color: '#0F766E',
        services: {
          create: services.map((s) => ({ serviceId: s.id })),
        },
      },
    });

    for (const [dayOfWeek, conf] of Object.entries(DEFAULT_WEEK_BLOCKS)) {
      if (conf.isClosed) continue;
      await this.prisma.workerSchedule.create({
        data: {
          workerId: worker.id,
          dayOfWeek: dayOfWeek as DayOfWeek,
          blocks: {
            create: conf.blocks.map((b, i) => ({ ...b, sortOrder: i })),
          },
        },
      });
    }

    this.logger.log(
      `Portal demo creado: /${DEMO_SLUG} (admin@barberiapremium.test / Admin12345!)`,
    );
  }
}
