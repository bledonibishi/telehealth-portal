import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadKind } from '@prisma/client';

// Encrypted files start with this marker, then the IV and auth tag. Files
// without it were stored before encryption was switched on, and are read as-is.
const MAGIC = Buffer.from('THENC1');
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Client filenames only ever become part of a name inside the patient's own
// folder: no path segments, nothing outside a conservative character set.
export function safeFilename(original: string) {
  const name = basename(original).replace(/[^\w.-]+/g, '_').replace(/^\.+/, '');
  return name.slice(-100) || 'file';
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly key: Buffer | null;
  private readonly root: string;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    this.root = config.get<string>('UPLOAD_DIR') ?? join(process.cwd(), 'uploads');
    const raw = config.get<string>('UPLOAD_ENCRYPTION_KEY');
    if (raw) {
      const key = Buffer.from(raw, 'base64');
      if (key.length !== 32) throw new Error('UPLOAD_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
      this.key = key;
    } else {
      this.key = null;
      this.logger.warn('UPLOAD_ENCRYPTION_KEY not set — ID documents and photos are stored unencrypted');
    }
  }

  async save(patientId: string, kind: UploadKind, file: Express.Multer.File) {
    const dir = join(this.root, patientId);
    await mkdir(dir, { recursive: true });

    const storageKey = `${patientId}/${randomUUID()}-${safeFilename(file.originalname)}`;
    await writeFile(join(this.root, storageKey), this.encrypt(file.buffer));

    return this.prisma.uploadedFile.create({
      data: {
        patientId,
        kind,
        filename: file.originalname,
        mimeType: file.mimetype,
        storageKey,
      },
    });
  }

  async findForAccess(id: string, requester: { id: string; role: string }) {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');

    const isOwner = requester.role === 'PATIENT' && requester.id === file.patientId;
    const isClinician = requester.role === 'CLINICIAN';
    if (!isOwner && !isClinician) throw new NotFoundException('File not found');

    return file;
  }

  async readContents(file: { storageKey: string }): Promise<Buffer> {
    return this.decrypt(await readFile(join(this.root, file.storageKey)));
  }

  private encrypt(plain: Buffer): Buffer {
    if (!this.key) return plain;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
  }

  private decrypt(stored: Buffer): Buffer {
    if (!stored.subarray(0, MAGIC.length).equals(MAGIC)) return stored;
    if (!this.key) throw new Error('File is encrypted but UPLOAD_ENCRYPTION_KEY is not set');
    const iv = stored.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
    const tag = stored.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(stored.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]);
  }
}
