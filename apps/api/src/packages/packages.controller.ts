import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
import { PackagesService } from './packages.service';

class CreatePackageDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() serviceId?: string;
  @IsNumber() @Min(1) sessions!: number;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsNumber() @Min(1) validityDays?: number;
}

class SellDto {
  @IsString() packageId!: string;
  @IsString() clientId!: string;
  @IsOptional() @IsString() notes?: string;
}

class ToggleDto {
  @IsBoolean() isActive!: boolean;
}

@ApiTags('packages')
@Controller('packages')
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.packages.list(tenantId);
  }

  @Get('purchases')
  purchases(
    @TenantId() tenantId: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.packages.listClientPackages(tenantId, clientId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@TenantId() tenantId: string, @Body() dto: CreatePackageDto) {
    return this.packages.create(tenantId, dto);
  }

  @Post('sell')
  sell(@TenantId() tenantId: string, @Body() dto: SellDto) {
    return this.packages.sell(tenantId, dto);
  }

  @Post('purchases/:id/consume')
  consume(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.packages.consume(tenantId, id);
  }

  @Post('purchases/:id/restore')
  restore(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.packages.restore(tenantId, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  toggle(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ToggleDto,
  ) {
    return this.packages.toggle(tenantId, id, dto.isActive);
  }
}
