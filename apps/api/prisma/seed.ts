import { PrismaClient, DayOfWeek } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Admin12345!', 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'barberia-premium' },
    update: {},
    create: {
      name: 'Barbería Premium',
      slug: 'barberia-premium',
      email: 'admin@barberiapremium.test',
      phone: '+573001112233',
      address: 'Calle 100 #15-20',
      city: 'Bogotá',
      country: 'CO',
      mapUrl: 'https://maps.google.com/?q=Bogota',
      primaryColor: '#0F766E',
      settings: {
        create: {
          minBookingNoticeMinutes: 60,
          maxBookingDaysAhead: 60,
          cancellationMinHours: 24,
          bufferCleanMinutes: 5,
          allowOnlineBooking: true,
          reminderHoursBefore: 24,
          reminder2HoursBefore: true,
          reviewRequestEnabled: true,
          waitlistEnabled: true,
          loyaltyEnabled: true,
        },
      },
      whatsappBot: {
        create: {
          enabled: true,
          businessName: 'Barbería Premium',
        },
      },
      loyaltyProgram: { create: {} },
    },
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'admin@barberiapremium.test',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@barberiapremium.test',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Premium',
      role: 'ADMIN',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'principal' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Sede Principal',
      slug: 'principal',
      isMain: true,
      address: 'Calle 100 #15-20',
      city: 'Bogotá',
    },
  });

  const days: DayOfWeek[] = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
  ];

  for (const dayOfWeek of days) {
    await prisma.branchSchedule.upsert({
      where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek } },
      update: {},
      create: {
        branchId: branch.id,
        dayOfWeek,
        blocks: {
          create:
            dayOfWeek === DayOfWeek.SATURDAY
              ? [{ startTime: '09:00', endTime: '14:00' }]
              : [
                  { startTime: '09:00', endTime: '13:00', sortOrder: 0 },
                  { startTime: '14:00', endTime: '19:00', sortOrder: 1 },
                ],
        },
      },
    });
  }

  await prisma.branchSchedule.upsert({
    where: {
      branchId_dayOfWeek: { branchId: branch.id, dayOfWeek: DayOfWeek.SUNDAY },
    },
    update: { isClosed: true },
    create: { branchId: branch.id, dayOfWeek: DayOfWeek.SUNDAY, isClosed: true },
  });

  let category = await prisma.serviceCategory.findFirst({
    where: { tenantId: tenant.id, name: 'Caballero' },
  });
  if (!category) {
    category = await prisma.serviceCategory.create({
      data: { tenantId: tenant.id, name: 'Caballero', color: '#0F766E' },
    });
  }

  let spaCategory = await prisma.serviceCategory.findFirst({
    where: { tenantId: tenant.id, name: 'SPA' },
  });
  if (!spaCategory) {
    spaCategory = await prisma.serviceCategory.create({
      data: { tenantId: tenant.id, name: 'SPA', color: '#134E4A' },
    });
  }

  const serviceDefs = [
    { name: 'Corte Caballero', durationMinutes: 30, price: 35000, categoryId: category.id },
    { name: 'Barba', durationMinutes: 20, price: 20000, categoryId: category.id },
    { name: 'Corte + Barba', durationMinutes: 60, price: 50000, categoryId: category.id },
    { name: 'Tintura', durationMinutes: 90, price: 80000, categoryId: category.id },
    { name: 'Masaje', durationMinutes: 60, price: 90000, categoryId: spaCategory.id },
    { name: 'Facial', durationMinutes: 45, price: 70000, categoryId: spaCategory.id },
  ];

  const services = [];
  for (const def of serviceDefs) {
    let s = await prisma.service.findFirst({
      where: { tenantId: tenant.id, name: def.name, deletedAt: null },
    });
    if (!s) {
      s = await prisma.service.create({
        data: {
          tenantId: tenant.id,
          categoryId: def.categoryId,
          name: def.name,
          durationMinutes: def.durationMinutes,
          price: def.price,
          cleanMinutes: 5,
          color: '#0F766E',
        },
      });
    }
    services.push(s);
  }

  const specialtyNames = ['Corte', 'Barba', 'Tintura', 'Masaje', 'Facial'];
  const specialtyMap = new Map<string, string>();
  for (const name of specialtyNames) {
    const specialty = await prisma.specialty.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {},
      create: { tenantId: tenant.id, name },
    });
    specialtyMap.set(name, specialty.id);
  }

  const workerDefs = [
    { firstName: 'Carlos', lastName: 'López', specialties: ['Corte', 'Barba'] },
    { firstName: 'Mateo', lastName: 'García', specialties: ['Corte', 'Tintura'] },
    { firstName: 'Ana', lastName: 'Ruiz', specialties: ['Masaje', 'Facial'] },
  ];

  for (const w of workerDefs) {
    let worker = await prisma.worker.findFirst({
      where: { tenantId: tenant.id, firstName: w.firstName, lastName: w.lastName, deletedAt: null },
    });
    if (!worker) {
      worker = await prisma.worker.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          firstName: w.firstName,
          lastName: w.lastName,
          specialties: w.specialties,
          color: '#0F766E',
          services: {
            create: services.map((s) => ({ serviceId: s.id })),
          },
        },
      });
      for (const dayOfWeek of days) {
        await prisma.workerSchedule.create({
          data: {
            workerId: worker.id,
            dayOfWeek,
            blocks: {
              create:
                dayOfWeek === DayOfWeek.SATURDAY
                  ? [{ startTime: '09:00', endTime: '14:00' }]
                  : [
                      { startTime: '09:00', endTime: '13:00', sortOrder: 0 },
                      { startTime: '14:00', endTime: '19:00', sortOrder: 1 },
                    ],
            },
          },
        });
      }
    }

    for (const name of w.specialties) {
      const specialtyId = specialtyMap.get(name);
      if (!specialtyId) continue;
      await prisma.workerSpecialty.upsert({
        where: {
          workerId_specialtyId: { workerId: worker.id, specialtyId },
        },
        create: { workerId: worker.id, specialtyId },
        update: {},
      });
    }
    await prisma.worker.update({
      where: { id: worker.id },
      data: { specialties: w.specialties },
    });
  }

  await prisma.client.upsert({
    where: { tenantId_phone: { tenantId: tenant.id, phone: '+573009998877' } },
    update: {},
    create: {
      tenantId: tenant.id,
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '+573009998877',
      whatsapp: '+573009998877',
      email: 'juan@ejemplo.com',
    },
  });

  console.log('Seed OK — tenant: barberia-premium / admin@barberiapremium.test / Admin12345!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
