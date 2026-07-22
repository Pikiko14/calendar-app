import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TenantId } from '../common/decorators/tenant.decorator';
import { ServicesService } from './services.service';
import { CategoryDto, ServiceDto, UpdateServiceDto } from './dto/services.dto';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.services.list(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: ServiceDto) {
    return this.services.create(tenantId, dto);
  }

  @Patch(':id/toggle')
  toggle(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.services.toggleActive(tenantId, id);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.services.update(tenantId, id, dto);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.services.remove(tenantId, id);
  }

  @Get('categories')
  categories(@TenantId() tenantId: string) {
    return this.services.categories(tenantId);
  }

  @Post('categories')
  createCategory(@TenantId() tenantId: string, @Body() dto: CategoryDto) {
    return this.services.createCategory(tenantId, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CategoryDto>,
  ) {
    return this.services.updateCategory(tenantId, id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.services.deleteCategory(tenantId, id);
  }
}
