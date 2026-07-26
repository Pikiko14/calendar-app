import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  listCoupons(tenantId: string) {
    return this.prisma.coupon.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createCoupon(
    tenantId: string,
    dto: {
      code: string;
      discountPct?: number;
      discountAmt?: number;
      maxUses?: number;
      expiresAt?: string;
    },
  ) {
    if (!dto.discountPct && !dto.discountAmt) {
      throw new BadRequestException('Indica descuento % o monto.');
    }
    return this.prisma.coupon.create({
      data: {
        tenantId,
        code: dto.code.trim().toUpperCase(),
        discountPct: dto.discountPct,
        discountAmt:
          dto.discountAmt != null
            ? new Prisma.Decimal(dto.discountAmt)
            : undefined,
        maxUses: dto.maxUses,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async toggleCoupon(tenantId: string, id: string, isActive: boolean) {
    const c = await this.prisma.coupon.findFirst({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Cupón no encontrado.');
    return this.prisma.coupon.update({ where: { id }, data: { isActive } });
  }

  listGiftCards(tenantId: string) {
    return this.prisma.giftCard.findMany({
      where: { tenantId },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createGiftCard(
    tenantId: string,
    dto: { code?: string; amount: number; clientId?: string; expiresAt?: string },
  ) {
    const code =
      dto.code?.trim().toUpperCase() ||
      `GC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return this.prisma.giftCard.create({
      data: {
        tenantId,
        code,
        balance: new Prisma.Decimal(dto.amount),
        initial: new Prisma.Decimal(dto.amount),
        clientId: dto.clientId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async toggleGiftCard(tenantId: string, id: string, isActive: boolean) {
    const g = await this.prisma.giftCard.findFirst({ where: { id, tenantId } });
    if (!g) throw new NotFoundException('Gift card no encontrada.');
    return this.prisma.giftCard.update({ where: { id }, data: { isActive } });
  }
}
