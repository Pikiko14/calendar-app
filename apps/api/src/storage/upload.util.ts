import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

/** Multer en memoria (buffer) para subir a S3. */
export const imageMemoryUpload = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(
        new BadRequestException('Solo se permiten imágenes.') as unknown as Error,
        false,
      );
    }
    cb(null, true);
  },
};
