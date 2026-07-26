import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname, extname, join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { randomBytes } from 'crypto';

export type UploadFolder = 'logos' | 'workers' | 'gift-cards' | 'misc';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBase: string;
  private readonly localDir: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = (this.config.get<string>('storage.bucket') || '').trim();
    this.region = this.config.get<string>('storage.region') || 'us-east-1';
    this.publicBase = (
      this.config.get<string>('storage.publicUrl') || ''
    ).replace(/\/$/, '');
    this.localDir =
      this.config.get<string>('storage.localDir') ||
      join(process.cwd(), 'uploads');

    const accessKeyId = this.config.get<string>('storage.accessKeyId') || '';
    const secretAccessKey =
      this.config.get<string>('storage.secretAccessKey') || '';

    if (this.bucket && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: this.region,
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log(
        `Storage S3 activo → bucket=${this.bucket} region=${this.region}`,
      );
    } else {
      this.client = null;
      this.logger.warn(
        'Storage S3 no configurado; se usará disco local ./uploads (solo desarrollo).',
      );
    }
  }

  get isS3Enabled() {
    return !!this.client && !!this.bucket;
  }

  private uniqueName(originalName: string, forcedExt?: string) {
    const ext =
      forcedExt ||
      extname(originalName || '').toLowerCase() ||
      '.bin';
    const id = `${Date.now()}-${randomBytes(6).toString('hex')}`;
    return `${id}${ext.startsWith('.') ? ext : `.${ext}`}`;
  }

  private publicUrlForKey(key: string) {
    if (this.publicBase) return `${this.publicBase}/${key}`;
    // Estilo virtual-hosted (us-east-1 y demás)
    if (this.region === 'us-east-1') {
      return `https://${this.bucket}.s3.amazonaws.com/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Sube un buffer a S3 (o disco local si no hay S3).
   * Devuelve URL pública absoluta (S3) o ruta relativa /uploads/... (local).
   */
  async uploadBuffer(input: {
    buffer: Buffer;
    mimeType: string;
    originalName?: string;
    folder: UploadFolder;
    tenantId: string;
    filename?: string;
  }): Promise<{ url: string; key: string; storage: 's3' | 'local' }> {
    const filename =
      input.filename ||
      this.uniqueName(input.originalName || 'file', undefined);
    const key = `${input.tenantId}/${input.folder}/${filename}`;

    if (this.client && this.bucket) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.mimeType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return { url: this.publicUrlForKey(key), key, storage: 's3' };
    }

    const abs = join(this.localDir, input.tenantId, input.folder, filename);
    const dir = dirname(abs);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await pipeline(Readable.from(input.buffer), createWriteStream(abs));
    const url = `/uploads/${input.tenantId}/${input.folder}/${filename}`;
    return { url, key, storage: 'local' };
  }

  async uploadMulterFile(
    file: Express.Multer.File,
    opts: { folder: UploadFolder; tenantId: string },
  ) {
    if (!file?.buffer?.length) {
      throw new Error('Archivo vacío o no cargado en memoria.');
    }
    return this.uploadBuffer({
      buffer: file.buffer,
      mimeType: file.mimetype || 'application/octet-stream',
      originalName: file.originalname,
      folder: opts.folder,
      tenantId: opts.tenantId,
    });
  }
}
