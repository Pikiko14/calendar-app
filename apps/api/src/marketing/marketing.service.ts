import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';

const GIFT_CARD_QR_PREFIX = 'BBGC:';

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

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

  async removeCoupon(tenantId: string, id: string) {
    const c = await this.prisma.coupon.findFirst({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Cupón no encontrado.');
    await this.prisma.coupon.delete({ where: { id } });
    return { ok: true };
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
    return this.prisma.giftCard
      .create({
        data: {
          tenantId,
          code,
          balance: new Prisma.Decimal(dto.amount),
          initial: new Prisma.Decimal(dto.amount),
          clientId: dto.clientId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
        include: {
          client: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      })
      .then(async (gift) => {
        let imageUrl: string | null = null;
        try {
          const png = await QRCode.toBuffer(`${GIFT_CARD_QR_PREFIX}${gift.code}`, {
            type: 'png',
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'M',
          });
          const uploaded = await this.storage.uploadBuffer({
            buffer: png,
            mimeType: 'image/png',
            folder: 'gift-cards',
            tenantId,
            filename: `${gift.code.replace(/[^A-Z0-9_-]/gi, '')}.png`,
          });
          imageUrl = uploaded.url;
          await this.prisma.giftCard.update({
            where: { id: gift.id },
            data: { imageUrl },
          });
        } catch (e) {
          this.logger.warn(
            `No se pudo guardar imagen gift card ${gift.code}: ${
              e instanceof Error ? e.message : e
            }`,
          );
        }

        const amount = Number(dto.amount);
        const { invoice, payment } = await this.invoices.issuePaidSale(
          tenantId,
          {
            clientId: dto.clientId,
            description: `Gift card ${gift.code}`,
            amount,
            notes: `Gift card ${gift.code}`,
            metadata: {
              type: 'gift_card',
              giftCardId: gift.id,
              code: gift.code,
              clientId: dto.clientId || null,
              imageUrl,
            },
          },
        );

        if (dto.clientId) {
          void this.notifications
            .notifyGiftCardIssued(tenantId, {
              clientId: dto.clientId,
              code: gift.code,
              amount,
              expiresAt: gift.expiresAt,
              invoiceNumber: invoice.number,
            })
            .catch((e) =>
              this.logger.warn(
                `WhatsApp gift card no enviado: ${e instanceof Error ? e.message : e}`,
              ),
            );
        }

        return {
          ...gift,
          imageUrl,
          invoice: {
            id: invoice.id,
            number: invoice.number,
            total: invoice.total,
            status: invoice.status,
          },
          payment: { id: payment.id, amount: payment.amount },
        };
      });
  }

  async toggleGiftCard(tenantId: string, id: string, isActive: boolean) {
    const g = await this.prisma.giftCard.findFirst({ where: { id, tenantId } });
    if (!g) throw new NotFoundException('Gift card no encontrada.');
    return this.prisma.giftCard.update({ where: { id }, data: { isActive } });
  }

  async removeGiftCard(tenantId: string, id: string) {
    const g = await this.prisma.giftCard.findFirst({ where: { id, tenantId } });
    if (!g) throw new NotFoundException('Gift card no encontrada.');
    await this.prisma.giftCard.delete({ where: { id } });
    return { ok: true };
  }
}
