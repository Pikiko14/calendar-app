import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvoiceStatus, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import {
  CreateFromAppointmentDto,
  CreateInvoiceDto,
  PayInvoiceDto,
  ValidateGiftCardDto,
} from './dto/invoices.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar facturas del negocio' })
  list(
    @TenantId() tenantId: string,
    @Query('status') status?: InvoiceStatus,
    @Query('clientId') clientId?: string,
  ) {
    return this.invoices.list(tenantId, status, clientId);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resumen de facturación' })
  summary(@TenantId() tenantId: string) {
    return this.invoices.summary(tenantId);
  }

  @Post('validate-gift-card')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Validar gift card (activa, saldo, vigencia)' })
  validateGift(
    @TenantId() tenantId: string,
    @Body() dto: ValidateGiftCardDto,
  ) {
    return this.invoices.validateGiftCard(tenantId, dto.code);
  }

  @Get('by-appointment/:appointmentId')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Buscar factura de una cita' })
  byAppointment(
    @TenantId() tenantId: string,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.invoices.byAppointment(tenantId, appointmentId);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Descargar factura como HTML/PDF imprimible' })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async pdf(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.invoices.htmlDocument(tenantId, id);
    const invoice = await this.invoices.one(tenantId, id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.number}.html"`,
    );
    res.send(html);
  }

  @Post(':id/send-whatsapp')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Enviar factura por WhatsApp al cliente' })
  sendWa(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoices.sendWhatsApp(tenantId, id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  one(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoices.one(tenantId, id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Crear factura (manual o con appointmentId)' })
  create(@TenantId() tenantId: string, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(tenantId, dto);
  }

  @Post('from-appointment')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generar factura desde una cita' })
  fromAppointment(
    @TenantId() tenantId: string,
    @Body() dto: CreateFromAppointmentDto,
  ) {
    return this.invoices.createFromAppointment(tenantId, dto);
  }

  @Post(':id/pay')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Marcar factura como pagada' })
  pay(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: PayInvoiceDto,
  ) {
    return this.invoices.markPaid(tenantId, id, dto);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancelar factura' })
  cancel(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.invoices.cancel(tenantId, id);
  }
}
