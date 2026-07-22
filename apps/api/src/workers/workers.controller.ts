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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { TenantId } from '../common/decorators/tenant.decorator';
import { WorkersService } from './workers.service';
import {
  TimeOffDto,
  UpdateWorkerDto,
  WorkerDto,
  WorkerScheduleDto,
  WeeklyScheduleDto,
} from './dto/workers.dto';

const uploadDir = join(process.cwd(), 'uploads', 'workers');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@Controller('workers')
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.workers.list(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: WorkerDto) {
    return this.workers.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkerDto,
  ) {
    return this.workers.update(tenantId, id, dto);
  }

  @Post(':id/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Solo se permiten imágenes.') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  uploadPhoto(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debes seleccionar una imagen.');
    const photoUrl = `/uploads/workers/${file.filename}`;
    return this.workers.update(tenantId, id, { photoUrl });
  }

  @Delete(':id')
  delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workers.remove(tenantId, id);
  }

  @Post(':id/specialties')
  setSpecialties(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body('specialtyIds') specialtyIds: string[],
  ) {
    return this.workers.setSpecialties(tenantId, id, specialtyIds || []);
  }

  @Post(':id/services')
  services(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body('serviceIds') serviceIds: string[],
  ) {
    return this.workers.services(tenantId, id, serviceIds);
  }

  @Post(':id/schedules')
  schedule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: WorkerScheduleDto,
  ) {
    return this.workers.schedule(tenantId, id, dto);
  }

  @Put(':id/schedules/week')
  setWeeklySchedule(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: WeeklyScheduleDto,
  ) {
    return this.workers.setWeeklySchedule(tenantId, id, dto);
  }

  @Post(':id/time-off')
  timeOff(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: TimeOffDto,
  ) {
    return this.workers.timeOff(tenantId, id, dto);
  }
}
