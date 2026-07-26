import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantId } from '../common/decorators/tenant.decorator';
import { SkipSubscription } from '../common/decorators/skip-subscription.decorator';
import { StorageService } from '../storage/storage.service';
import { imageMemoryUpload } from '../storage/upload.util';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto, UpdateTenantSettingsDto } from './dto/tenant.dto';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly storage: StorageService,
  ) {}

  @SkipSubscription()
  @Get('me')
  get(@TenantId() id: string) {
    return this.tenants.get(id);
  }

  @Patch('me')
  update(@TenantId() id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }

  @Post('me/logo')
  @UseInterceptors(FileInterceptor('logo', imageMemoryUpload))
  async uploadLogo(
    @TenantId() id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debes seleccionar una imagen.');
    const uploaded = await this.storage.uploadMulterFile(file, {
      folder: 'logos',
      tenantId: id,
    });
    return this.tenants.update(id, { logoUrl: uploaded.url });
  }

  @SkipSubscription()
  @Get('settings')
  settings(@TenantId() id: string) {
    return this.tenants.settings(id);
  }

  @Patch('settings')
  updateSettings(
    @TenantId() id: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenants.updateSettings(id, dto);
  }
}
