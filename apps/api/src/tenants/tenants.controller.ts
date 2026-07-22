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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { TenantId } from '../common/decorators/tenant.decorator';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto, UpdateTenantSettingsDto } from './dto/tenant.dto';

const logoUploadDir = join(process.cwd(), 'uploads', 'tenants');
if (!existsSync(logoUploadDir)) {
  mkdirSync(logoUploadDir, { recursive: true });
}

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get('me')
  get(@TenantId() id: string) {
    return this.tenants.get(id);
  }

  @Patch('me')
  update(@TenantId() id: string, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(id, dto);
  }

  @Post('me/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: logoUploadDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(
            new BadRequestException('Solo se permiten imágenes.') as any,
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadLogo(
    @TenantId() id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debes seleccionar una imagen.');
    const logoUrl = `/uploads/tenants/${file.filename}`;
    return this.tenants.update(id, { logoUrl });
  }

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
