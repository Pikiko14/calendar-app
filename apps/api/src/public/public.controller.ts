import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { AppointmentsService } from '../appointments/appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';

class PublicBookDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsString() @MinLength(5) phone!: string;
  @IsOptional() @IsString() email?: string;
  @IsString() serviceId!: string;
  @IsString() workerId!: string;
  @IsDateString() startAt!: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly reviews: ReviewsService,
  ) {}

  @Public()
  @Get(':slug')
  async tenant(@Param('slug') slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
        address: true,
        city: true,
        mapUrl: true,
        timezone: true,
        currency: true,
        settings: {
          select: {
            allowOnlineBooking: true,
            bookingPageTitle: true,
            bookingPageSubtitle: true,
            darkModeDefault: true,
            minBookingNoticeMinutes: true,
            maxBookingDaysAhead: true,
          },
        },
      },
    });
    if (!tenant) return null;
    const rating = await this.reviews.getTenantRating(tenant.id);
    return { ...tenant, rating };
  }

  @Public()
  @Get(':slug/services')
  async services(@Param('slug') slug: string) {
    const tenant = await this.requireTenant(slug);
    return this.prisma.service.findMany({
      where: { tenantId: tenant.id, isActive: true, deletedAt: null },
      include: { category: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Public()
  @Get(':slug/workers')
  async workers(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId?: string,
  ) {
    const tenant = await this.requireTenant(slug);
    const select = {
      id: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      specialties: true,
      color: true,
      ratingAvg: true,
      ratingCount: true,
      specialtyLinks: {
        where: { specialty: { deletedAt: null, isActive: true } },
        include: { specialty: { select: { id: true, name: true, color: true } } },
      },
    } as const;

    if (!serviceId) {
      return this.prisma.worker.findMany({
        where: { tenantId: tenant.id, isActive: true, deletedAt: null },
        select,
        orderBy: { sortOrder: 'asc' },
      });
    }

    // Preferidos: asignados al servicio, o sin ninguna asignación (pueden hacer todo)
    const linked = await this.prisma.worker.findMany({
      where: {
        tenantId: tenant.id,
        isActive: true,
        deletedAt: null,
        OR: [
          { services: { some: { serviceId } } },
          { services: { none: {} } },
        ],
      },
      select,
      orderBy: { sortOrder: 'asc' },
    });

    if (linked.length) return linked;

    // Servicio nuevo sin vínculos: mostrar todo el equipo activo
    return this.prisma.worker.findMany({
      where: { tenantId: tenant.id, isActive: true, deletedAt: null },
      select,
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Public()
  @Get(':slug/availability')
  async availability(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId: string,
    @Query('workerId') workerId: string,
    @Query('date') date: string,
  ) {
    const tenant = await this.requireTenant(slug);
    return this.appointments.availability(tenant.id, {
      serviceId,
      workerId,
      date,
    });
  }

  @Public()
  @Post(':slug/book')
  async book(@Param('slug') slug: string, @Body() dto: PublicBookDto) {
    const tenant = await this.requireTenant(slug);
    const client = await this.prisma.client.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone: dto.phone } },
      create: {
        tenantId: tenant.id,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        whatsapp: dto.phone,
        email: dto.email,
      },
      update: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
      },
    });

    return this.appointments.create(tenant.id, {
      clientId: client.id,
      workerId: dto.workerId,
      serviceId: dto.serviceId,
      startAt: dto.startAt,
      notes: dto.notes,
      source: 'web',
    });
  }

  private async requireTenant(slug: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!tenant) {
      throw new NotFoundException('Negocio no encontrado');
    }
    return tenant;
  }
}
