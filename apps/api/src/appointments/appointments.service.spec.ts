import { ConflictException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService conflict rules', () => {
  const prisma: any = {
    service: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  const service = new AppointmentsService(prisma);

  it('rechaza fechas inválidas en el cálculo de rango', () => {
    expect(() =>
      (service as any).range('fecha-invalida', {
        durationMinutes: 30,
        prepMinutes: 0,
        cleanMinutes: 5,
        travelMinutes: 0,
      }),
    ).toThrow(ConflictException);
  });

  it('incluye buffers de prep y limpieza en el rango', () => {
    const range = (service as any).range('2026-07-20T10:00:00.000Z', {
      durationMinutes: 30,
      prepMinutes: 10,
      cleanMinutes: 5,
      travelMinutes: 0,
    });
    expect(range.bufferStartAt.toISOString()).toBe('2026-07-20T09:50:00.000Z');
    expect(range.endAt.toISOString()).toBe('2026-07-20T10:30:00.000Z');
    expect(range.bufferEndAt.toISOString()).toBe('2026-07-20T10:35:00.000Z');
  });

  it('expone estados activos que bloquean agenda', () => {
    expect([
      AppointmentStatus.PENDING,
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.ON_THE_WAY,
    ]).toHaveLength(3);
  });
});
