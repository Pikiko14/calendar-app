import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFromAppointmentDto,
  CreateInvoiceDto,
  PayInvoiceDto,
} from './dto/invoices.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, status?: InvoiceStatus) {
    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        appointment: {
          select: { id: true, startAt: true, status: true },
        },
        items: { orderBy: { sortOrder: 'asc' } },
        payments: {
          select: { id: true, amount: true, method: true, paidAt: true, status: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }

  async byAppointment(tenantId: string, appointmentId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        appointmentId,
        status: { not: InvoiceStatus.CANCELLED },
      },
      include: {
        client: true,
        items: { orderBy: { sortOrder: 'asc' } },
        appointment: {
          include: {
            service: true,
            worker: { select: { firstName: true, lastName: true } },
          },
        },
        payments: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
    return invoice;
  }

  async one(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        appointment: {
          include: {
            service: true,
            worker: { select: { firstName: true, lastName: true } },
          },
        },
        items: { orderBy: { sortOrder: 'asc' } },
        payments: true,
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');
    return invoice;
  }

  private async nextNumber(tenantId: string) {
    const year = new Date().getFullYear();
    const prefix = `FAC-${year}-`;
    const last = await this.prisma.invoice.findFirst({
      where: { tenantId, number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    let seq = 1;
    if (last?.number) {
      const part = last.number.slice(prefix.length);
      const n = Number.parseInt(part, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async create(tenantId: string, dto: CreateInvoiceDto) {
    if (dto.appointmentId) {
      return this.createFromAppointment(tenantId, {
        appointmentId: dto.appointmentId,
        tax: dto.tax,
        notes: dto.notes,
      });
    }

    const items = dto.items || [];
    if (!items.length) {
      throw new BadRequestException('Agrega al menos un ítem a la factura.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });

    const mapped = items.map((it, i) => {
      const qty = it.quantity && it.quantity > 0 ? it.quantity : 1;
      const unit = Number(it.unitPrice);
      const total = Math.round(qty * unit * 100) / 100;
      return {
        description: it.description,
        quantity: qty,
        unitPrice: new Prisma.Decimal(unit),
        total: new Prisma.Decimal(total),
        serviceId: it.serviceId,
        sortOrder: i,
      };
    });

    const subtotal = mapped.reduce((s, it) => s + Number(it.total), 0);
    const tax = Number(dto.tax || 0);
    const total = Math.round((subtotal + tax) * 100) / 100;
    const number = await this.nextNumber(tenantId);

    return this.prisma.invoice.create({
      data: {
        tenantId,
        number,
        clientId: dto.clientId,
        status: InvoiceStatus.ISSUED,
        currency: dto.currency || tenant?.currency || 'COP',
        subtotal,
        tax,
        total,
        notes: dto.notes,
        items: { create: mapped },
      },
      include: {
        client: true,
        items: true,
      },
    });
  }

  async createFromAppointment(
    tenantId: string,
    dto: CreateFromAppointmentDto,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId, tenantId, deletedAt: null },
      include: {
        service: true,
        client: true,
        worker: { select: { firstName: true, lastName: true } },
      },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada.');

    const existing = await this.prisma.invoice.findFirst({
      where: {
        tenantId,
        appointmentId: appointment.id,
        status: { not: InvoiceStatus.CANCELLED },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe la factura ${existing.number} para esta cita.`,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { currency: true },
    });

    const unit = Number(appointment.price);
    const discount = Number(appointment.discount || 0);
    const lineTotal = Math.max(0, unit - discount);
    const tax = Number(dto.tax || 0);
    const total = Math.round((lineTotal + tax) * 100) / 100;
    const number = await this.nextNumber(tenantId);
    const workerName =
      `${appointment.worker.firstName} ${appointment.worker.lastName}`.trim();

    return this.prisma.invoice.create({
      data: {
        tenantId,
        number,
        clientId: appointment.clientId,
        appointmentId: appointment.id,
        status: InvoiceStatus.ISSUED,
        currency: tenant?.currency || 'COP',
        subtotal: lineTotal,
        tax,
        total,
        notes:
          dto.notes ||
          `Cita ${appointment.startAt.toISOString().slice(0, 16).replace('T', ' ')} · ${workerName}`,
        items: {
          create: [
            {
              description: appointment.service.name,
              quantity: 1,
              unitPrice: unit,
              total: lineTotal,
              serviceId: appointment.serviceId,
              sortOrder: 0,
            },
          ],
        },
      },
      include: {
        client: true,
        items: true,
        appointment: { select: { id: true, startAt: true } },
      },
    });
  }

  async markPaid(tenantId: string, id: string, dto: PayInvoiceDto) {
    const invoice = await this.one(tenantId, id);
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('La factura está cancelada.');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('La factura ya está pagada.');
    }

    const amount = dto.amount != null ? Number(dto.amount) : Number(invoice.total);

    const [payment, updated] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          appointmentId: invoice.appointmentId,
          amount,
          currency: invoice.currency,
          method: dto.method || PaymentMethod.CASH,
          provider: PaymentProvider.LOCAL,
          status: PaymentStatus.PAID,
          paidAt: new Date(),
        },
      }),
      this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: new Date(),
        },
        include: {
          client: true,
          items: true,
          payments: true,
        },
      }),
    ]);

    return { invoice: updated, payment };
  }

  async cancel(tenantId: string, id: string) {
    const invoice = await this.one(tenantId, id);
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException(
        'No puedes cancelar una factura ya pagada.',
      );
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      return invoice;
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
      include: { client: true, items: true },
    });
  }

  async summary(tenantId: string) {
    const [issued, paid, cancelled, paidAgg] = await Promise.all([
      this.prisma.invoice.count({
        where: { tenantId, status: InvoiceStatus.ISSUED },
      }),
      this.prisma.invoice.count({
        where: { tenantId, status: InvoiceStatus.PAID },
      }),
      this.prisma.invoice.count({
        where: { tenantId, status: InvoiceStatus.CANCELLED },
      }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: InvoiceStatus.PAID },
        _sum: { total: true },
      }),
    ]);
    return {
      issued,
      paid,
      cancelled,
      paidTotal: Number(paidAgg._sum.total || 0),
    };
  }
}
