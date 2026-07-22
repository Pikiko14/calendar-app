import { Injectable, NotFoundException } from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_WEEK_BLOCKS,
  type DayKey,
} from '../common/schedule.util';
import {
  BranchDto,
  ScheduleDto,
  WeeklyBranchScheduleDto,
} from './dto/branches.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      include: { schedules: { include: { blocks: { orderBy: { sortOrder: 'asc' } } } } },
    });
  }

  create(tenantId: string, dto: BranchDto) {
    return this.prisma.branch.create({ data: { tenantId, ...dto } });
  }

  async update(tenantId: string, id: string, dto: Partial<BranchDto>) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!branch) throw new NotFoundException('Sede no encontrada.');
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.update(tenantId, id, {});
    return this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /** Sede principal del negocio (la crea con horario por defecto si no existe). */
  async getOrCreateMain(tenantId: string) {
    let branch = await this.prisma.branch.findFirst({
      where: { tenantId, deletedAt: null, isMain: true },
      include: {
        schedules: { include: { blocks: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
    if (branch) return branch;

    branch = await this.prisma.branch.findFirst({
      where: { tenantId, deletedAt: null },
      include: {
        schedules: { include: { blocks: { orderBy: { sortOrder: 'asc' } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (branch) {
      return this.prisma.branch.update({
        where: { id: branch.id },
        data: { isMain: true },
        include: {
          schedules: { include: { blocks: { orderBy: { sortOrder: 'asc' } } } },
        },
      });
    }

    const created = await this.prisma.branch.create({
      data: {
        tenantId,
        name: 'Sede Principal',
        slug: 'principal',
        isMain: true,
      },
    });
    await this.seedDefaultSchedule(created.id);
    return this.prisma.branch.findFirstOrThrow({
      where: { id: created.id },
      include: {
        schedules: { include: { blocks: { orderBy: { sortOrder: 'asc' } } } },
      },
    });
  }

  async seedDefaultSchedule(branchId: string) {
    for (const [dayOfWeek, conf] of Object.entries(DEFAULT_WEEK_BLOCKS)) {
      await this.prisma.branchSchedule.upsert({
        where: {
          branchId_dayOfWeek: {
            branchId,
            dayOfWeek: dayOfWeek as DayOfWeek,
          },
        },
        create: {
          branchId,
          dayOfWeek: dayOfWeek as DayOfWeek,
          isClosed: conf.isClosed,
          blocks: {
            create: conf.blocks.map((b, i) => ({ ...b, sortOrder: i })),
          },
        },
        update: {},
      });
    }
  }

  async getWeeklySchedule(tenantId: string) {
    const branch = await this.getOrCreateMain(tenantId);
    if (!branch.schedules.length) {
      await this.seedDefaultSchedule(branch.id);
      return this.getOrCreateMain(tenantId);
    }
    return branch;
  }

  async setDaySchedule(tenantId: string, branchId: string, dto: ScheduleDto) {
    await this.update(tenantId, branchId, {});
    const dayOfWeek = dto.dayOfWeek as DayOfWeek;
    const isClosed = dto.isClosed ?? false;
    const blocks = isClosed ? [] : dto.blocks;
    return this.prisma.branchSchedule.upsert({
      where: { branchId_dayOfWeek: { branchId, dayOfWeek } },
      create: {
        branchId,
        dayOfWeek,
        isClosed,
        blocks: { create: blocks.map((b, i) => ({ ...b, sortOrder: i })) },
      },
      update: {
        isClosed,
        blocks: {
          deleteMany: {},
          create: blocks.map((b, i) => ({ ...b, sortOrder: i })),
        },
      },
      include: { blocks: true },
    });
  }

  async setWeeklySchedule(tenantId: string, dto: WeeklyBranchScheduleDto) {
    const branch = await this.getOrCreateMain(tenantId);
    for (const day of dto.days) {
      await this.setDaySchedule(tenantId, branch.id, day);
    }
    return this.getWeeklySchedule(tenantId);
  }

  /** Copia el horario de la sede a todos los trabajadores activos. */
  async applyToWorkers(tenantId: string) {
    const branch = await this.getWeeklySchedule(tenantId);
    const workers = await this.prisma.worker.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
    });

    for (const worker of workers) {
      for (const schedule of branch.schedules) {
        const dayOfWeek = schedule.dayOfWeek as DayKey;
        const isOff = schedule.isClosed;
        const blocks = isOff
          ? []
          : schedule.blocks.map((b) => ({
              startTime: b.startTime,
              endTime: b.endTime,
            }));
        await this.prisma.workerSchedule.upsert({
          where: {
            workerId_dayOfWeek: { workerId: worker.id, dayOfWeek },
          },
          create: {
            workerId: worker.id,
            dayOfWeek,
            isOff,
            blocks: { create: blocks.map((b, i) => ({ ...b, sortOrder: i })) },
          },
          update: {
            isOff,
            blocks: {
              deleteMany: {},
              create: blocks.map((b, i) => ({ ...b, sortOrder: i })),
            },
          },
        });
      }
      await this.prisma.worker.update({
        where: { id: worker.id },
        data: { branchId: branch.id },
      });
    }

    return { updated: workers.length, branchId: branch.id };
  }

  /** Copia horario de sede a un trabajador concreto (alta). */
  async copyScheduleToWorker(tenantId: string, workerId: string) {
    const branch = await this.getWeeklySchedule(tenantId);
    for (const schedule of branch.schedules) {
      const isOff = schedule.isClosed;
      const blocks = isOff
        ? []
        : schedule.blocks.map((b) => ({
            startTime: b.startTime,
            endTime: b.endTime,
          }));
      await this.prisma.workerSchedule.upsert({
        where: {
          workerId_dayOfWeek: {
            workerId,
            dayOfWeek: schedule.dayOfWeek,
          },
        },
        create: {
          workerId,
          dayOfWeek: schedule.dayOfWeek,
          isOff,
          blocks: { create: blocks.map((b, i) => ({ ...b, sortOrder: i })) },
        },
        update: {
          isOff,
          blocks: {
            deleteMany: {},
            create: blocks.map((b, i) => ({ ...b, sortOrder: i })),
          },
        },
      });
    }
    return branch.id;
  }
}
