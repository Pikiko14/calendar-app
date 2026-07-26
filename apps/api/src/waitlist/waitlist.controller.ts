import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole, WaitlistStatus } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import { WaitlistService } from './waitlist.service';

class CreateWaitlistDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() @MinLength(5) phone?: string;
  @IsString() serviceId!: string;
  @IsOptional() @IsString() workerId?: string;
  @IsOptional() @IsDateString() preferredDate?: string;
  @IsOptional() @IsString() preferredTime?: string;
}

class StatusDto {
  @IsEnum(WaitlistStatus) status!: WaitlistStatus;
}

@ApiTags('waitlist')
@Controller('waitlist')
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('status') status?: WaitlistStatus,
  ) {
    return this.waitlist.list(tenantId, status);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateWaitlistDto) {
    return this.waitlist.create(tenantId, dto);
  }

  @Patch(':id/status')
  status(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: StatusDto,
  ) {
    return this.waitlist.updateStatus(tenantId, id, dto.status);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.waitlist.remove(tenantId, id);
  }
}
