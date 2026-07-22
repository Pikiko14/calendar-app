import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TenantId } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AppointmentsService } from './appointments.service';
import {
  AvailabilityDto,
  CreateAppointmentDto,
  RescheduleDto,
  StatusDto,
} from './dto/appointments.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private s: AppointmentsService) {}

  @Get()
  list(@TenantId() t: string, @CurrentUser() user: JwtPayload) {
    return this.s.list(t, user);
  }

  @Get('availability')
  availability(@TenantId() t: string, @Query() d: AvailabilityDto) {
    return this.s.availability(t, d);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Post()
  create(@TenantId() t: string, @Body() d: CreateAppointmentDto) {
    return this.s.create(t, d);
  }

  @Patch(':id/status')
  status(
    @TenantId() t: string,
    @Param('id') i: string,
    @Body() d: StatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.s.updateStatus(t, i, d, user);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Post(':id/reschedule')
  reschedule(
    @TenantId() t: string,
    @Param('id') i: string,
    @Body() d: RescheduleDto,
  ) {
    return this.s.reschedule(t, i, d);
  }

  @Post(':id/cancel')
  cancel(
    @TenantId() t: string,
    @Param('id') i: string,
    @Body() d: StatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.s.cancel(t, i, d, user);
  }
}
