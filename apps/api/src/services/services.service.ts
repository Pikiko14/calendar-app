import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryDto, ServiceDto, UpdateServiceDto } from './dto/services.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  categories(tenantId: string) {
    return this.prisma.serviceCategory.findMany({
      where: { tenantId, deletedAt: null },
      include: { services: { where: { deletedAt: null } } },
    });
  }

  createCategory(tenantId: string, dto: CategoryDto) {
    return this.prisma.serviceCategory.create({ data: { tenantId, ...dto } });
  }

  updateCategory(tenantId: string, id: string, dto: Partial<CategoryDto>) {
    return this.prisma.serviceCategory.update({
      where: { id },
      data: { ...dto, ...(tenantId ? {} : {}) },
    });
  }

  async deleteCategory(tenantId: string, id: string) {
    const cat = await this.prisma.serviceCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!cat) throw new NotFoundException('Categoría no encontrada.');
    return this.prisma.serviceCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  list(tenantId: string) {
    return this.prisma.service.findMany({
      where: { tenantId, deletedAt: null },
      include: { category: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: ServiceDto) {
    const service = await this.prisma.service.create({
      data: { tenantId, ...dto },
    });
    const workers = await this.prisma.worker.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (workers.length) {
      await this.prisma.workerService.createMany({
        data: workers.map((w) => ({ workerId: w.id, serviceId: service.id })),
        skipDuplicates: true,
      });
    }
    return service;
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado.');
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async toggleActive(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado.');
    return this.prisma.service.update({
      where: { id },
      data: { isActive: !service.isActive },
    });
  }

  async remove(tenantId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado.');
    return this.prisma.service.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
