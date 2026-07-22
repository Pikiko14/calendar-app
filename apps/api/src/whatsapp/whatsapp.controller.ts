import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import { UserRole } from '@prisma/client';
import { WhatsappService } from './whatsapp.service';
import { WhatsappBaileysService } from './whatsapp-baileys.service';

class WhatsappWebhookDto {
  @IsString()
  @MinLength(5)
  phone!: string;

  @IsString()
  @MinLength(1)
  text!: string;
}

class DisconnectDto {
  @IsOptional()
  @IsBoolean()
  logout?: boolean;
}

class UpdateWhatsappConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  welcomeMsg?: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;
}

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly baileys: WhatsappBaileysService,
  ) {}

  @Get('status')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Estado de la sesión WhatsApp de este negocio (tenant)',
  })
  status(@TenantId() tenantId: string) {
    return this.baileys.getStatusWithConfig(tenantId);
  }

  @Get('config')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Configuración del bot WhatsApp de este negocio' })
  config(@TenantId() tenantId: string) {
    return this.whatsapp.getBotConfig(tenantId);
  }

  @Patch('config')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Actualizar config del bot (por negocio)' })
  updateConfig(
    @TenantId() tenantId: string,
    @Body() body: UpdateWhatsappConfigDto,
  ) {
    return this.whatsapp.updateBotConfig(tenantId, body);
  }

  @Get('qr')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'QR de la sesión de este negocio' })
  qr(@TenantId() tenantId: string) {
    return this.baileys.getQr(tenantId);
  }

  @Post('connect')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Conectar WhatsApp Web (sesión aislada por negocio)',
  })
  connect(@TenantId() tenantId: string) {
    return this.baileys.connect(tenantId);
  }

  @Post('disconnect')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Desconectar sesión WhatsApp de este negocio' })
  disconnect(@TenantId() tenantId: string, @Body() body: DisconnectDto) {
    return this.baileys.disconnect(tenantId, body.logout !== false);
  }

  @Post('webhook')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Procesar mensaje entrante (manual / integraciones)' })
  handle(@TenantId() tenantId: string, @Body() body: WhatsappWebhookDto) {
    return this.whatsapp.handleIncoming(tenantId, body.phone, body.text);
  }

  @Post('simulate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Simular conversación WhatsApp (desarrollo)' })
  simulate(@TenantId() tenantId: string, @Body() body: WhatsappWebhookDto) {
    return this.whatsapp.handleIncoming(tenantId, body.phone, body.text);
  }
}
