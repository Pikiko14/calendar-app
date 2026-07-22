import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto, UpdateTenantSettingsDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async get(id: string) {
    const x = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: { settings: true },
    });
    if (!x) throw new NotFoundException('Negocio no encontrado.');
    return x;
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: dto,
    });

    // Mantener sede principal alineada (confirmaciones / IA)
    const locationPatch: {
      address?: string | null;
      city?: string | null;
      mapUrl?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } = {};
    if (dto.address !== undefined) locationPatch.address = dto.address;
    if (dto.city !== undefined) locationPatch.city = dto.city;
    if (dto.mapUrl !== undefined) locationPatch.mapUrl = dto.mapUrl;
    if (dto.latitude !== undefined) locationPatch.latitude = dto.latitude;
    if (dto.longitude !== undefined) locationPatch.longitude = dto.longitude;

    if (Object.keys(locationPatch).length) {
      await this.prisma.branch.updateMany({
        where: { tenantId: id, isMain: true, deletedAt: null },
        data: locationPatch,
      });
    }

    return tenant;
  }

  settings(id: string) {
    return this.prisma.tenantSettings.upsert({
      where: { tenantId: id },
      create: { tenantId: id },
      update: {},
    });
  }

  updateSettings(id: string, dto: UpdateTenantSettingsDto) {
    return this.prisma.tenantSettings.upsert({
      where: { tenantId: id },
      create: { tenantId: id, ...dto },
      update: dto,
    });
  }
}
