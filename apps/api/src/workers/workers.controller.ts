import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';
import { StorageService } from '../storage/storage.service';
import { imageMemoryUpload } from '../storage/upload.util';
import { WorkersService } from './workers.service';
import {
  TimeOffDto,
  UpdateWorkerDto,
  WorkerDto,
  WorkerScheduleDto,
  WeeklyScheduleDto,
} from './dto/workers.dto';

@Controller('workers')
export class WorkersController {
  constructor(
    private readonly workers: WorkersService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.workers.list(tenantId);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Post()
  create(@TenantId() tenantId: string, @Body() dto: WorkerDto) {
    return this.workers.create(tenantId, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkerDto,
  ) {
    return this.workers.update(tenantId, id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo', imageMemoryUpload))
  async uploadPhoto(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debes seleccionar una imagen.');
    const uploaded = await this.storage.uploadMulterFile(file, {
      folder: 'workers',
      tenantId,
    });
    return this.workers.update(tenantId, id, { photoUrl: uploaded.url });
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Delete(':id')
  delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workers.remove(tenantId, id);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Post(':id/specialties')
  setSpecialties(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body('specialtyIds') specialtyIds: string[],
  ) {
    return this.workers.setSpecialties(tenantId, id, specialtyIds || []);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Post(':id/services')
  services(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body('serviceIds') serviceIds: string[],
  ) {
    return this.workers.services(tenantId, id, serviceIds);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Post(':id/schedules')
  schedule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: WorkerScheduleDto,
  ) {
    return this.workers.schedule(tenantId, id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Put(':id/schedules/week')
  setWeeklySchedule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: WeeklyScheduleDto,
  ) {
    return this.workers.setWeeklySchedule(tenantId, id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.SUPER_ADMIN)
  @Post(':id/time-off')
  timeOff(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: TimeOffDto,
  ) {
    return this.workers.timeOff(tenantId, id, dto);
  }
}
