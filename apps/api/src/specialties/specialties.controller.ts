import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { SpecialtiesService } from './specialties.service';
import { SpecialtyDto, UpdateSpecialtyDto } from './dto/specialties.dto';

@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialties: SpecialtiesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.specialties.list(tenantId);
  }

  @Post('ensure-defaults')
  ensureDefaults(@TenantId() tenantId: string) {
    return this.specialties.ensureDefaults(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: SpecialtyDto) {
    return this.specialties.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSpecialtyDto,
  ) {
    return this.specialties.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.specialties.remove(tenantId, id);
  }
}
