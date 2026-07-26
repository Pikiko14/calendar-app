import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import { MarketingService } from './marketing.service';

class CouponDto {
  @IsString() @MinLength(2) code!: string;
  @IsOptional() @IsNumber() @Min(1) discountPct?: number;
  @IsOptional() @IsNumber() @Min(0) discountAmt?: number;
  @IsOptional() @IsNumber() @Min(1) maxUses?: number;
  @IsOptional() @IsString() expiresAt?: string;
}

class GiftCardDto {
  @IsOptional() @IsString() code?: string;
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() expiresAt?: string;
}

class ToggleDto {
  @IsBoolean() isActive!: boolean;
}

@ApiTags('marketing')
@Controller('marketing')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get('coupons')
  coupons(@TenantId() tenantId: string) {
    return this.marketing.listCoupons(tenantId);
  }

  @Post('coupons')
  createCoupon(@TenantId() tenantId: string, @Body() dto: CouponDto) {
    return this.marketing.createCoupon(tenantId, dto);
  }

  @Patch('coupons/:id')
  toggleCoupon(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ToggleDto,
  ) {
    return this.marketing.toggleCoupon(tenantId, id, dto.isActive);
  }

  @Delete('coupons/:id')
  removeCoupon(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.marketing.removeCoupon(tenantId, id);
  }

  @Get('gift-cards')
  giftCards(@TenantId() tenantId: string) {
    return this.marketing.listGiftCards(tenantId);
  }

  @Post('gift-cards')
  createGift(@TenantId() tenantId: string, @Body() dto: GiftCardDto) {
    return this.marketing.createGiftCard(tenantId, dto);
  }

  @Patch('gift-cards/:id')
  toggleGift(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ToggleDto,
  ) {
    return this.marketing.toggleGiftCard(tenantId, id, dto.isActive);
  }

  @Delete('gift-cards/:id')
  removeGift(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.marketing.removeGiftCard(tenantId, id);
  }
}
