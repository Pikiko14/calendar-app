import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvoiceStatus, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import {
  CreateFromAppointmentDto,
  CreateInvoiceDto,
  PayInvoiceDto,
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
  ) {
    return this.invoices.list(tenantId, status);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resumen de facturación' })
  summary(@TenantId() tenantId: string) {
    return this.invoices.summary(tenantId);
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
