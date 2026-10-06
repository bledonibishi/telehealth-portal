import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';
import { basename } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadKind } from '@prisma/client';
import { accessRoleOf, AuthUser, PRESCRIBERS, STAFF } from '../auth/access-roles';
import { FILE_STORAGE, FileStorage } from './file-storage';

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

// Photos of a patient's body: only the patient and doctors may see them — not support or fulfilment staff.
const BODY_PHOTO_KINDS: UploadKind[] = [UploadKind.BODY_PHOTO_FRONT, UploadKind.BODY_PHOTO_SIDE, UploadKind.PROGRESS_PHOTO];

/** Whether a staff member may open a file of this kind. Patients' own access is decided separately. */
export function staffMayView(kind: UploadKind, user: Pick<AuthUser, 'role' | 'clinicianRole'>): boolean {
  const role = accessRoleOf(user);
  if (!role || role === 'PATIENT') return false;
  return (BODY_PHOTO_KINDS.includes(kind) ? PRESCRIBERS : STAFF).includes(role);
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_PROGRESS_PHOTO_BYTES = 10 * 1024 * 1024;

/** The file's first bytes agree with an image format (a client-declared type alone proves nothing). */
export function looksLikeImage(buf: Buffer): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  return (
    starts(0xff, 0xd8, 0xff) || // JPEG
    starts(0x89, 0x50, 0x4e, 0x47) || // PNG
    (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') ||
    (buf.subarray(4, 8).toString() === 'ftyp' && ['heic', 'heix', 'mif1', 'msf1', 'heif'].includes(buf.subarray(8, 12).toString())) // HEIC/HEIF
  );
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly key: Buffer | null;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
    @Inject(FILE_STORAGE) private storage: FileStorage,
  ) {
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
    if (kind === UploadKind.PROGRESS_PHOTO || kind === UploadKind.BODY_PHOTO_FRONT || kind === UploadKind.BODY_PHOTO_SIDE) {
      if (!IMAGE_TYPES.includes(file.mimetype) || !looksLikeImage(file.buffer)) {
        throw new BadRequestException('Please upload a photo (JPEG, PNG, WebP or HEIC)');
      }
      if (file.buffer.length > MAX_PROGRESS_PHOTO_BYTES) throw new BadRequestException('That photo is too large — please use one under 10 MB');
    }

    const storageKey = `${patientId}/${randomUUID()}-${safeFilename(file.originalname)}`;
    await this.storage.put(storageKey, this.encrypt(file.buffer));

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

  /**
   * The file, if this signed-in user may see it: its owner, or staff whose role allows that kind
   * of file. Anyone else gets the same "not found" as for a file that doesn't exist.
   */
  async findForAccess(id: string, requester: Pick<AuthUser, 'id' | 'role' | 'clinicianRole'>) {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');

    const isOwner = requester.role === 'PATIENT' && requester.id === file.patientId;
    if (!isOwner && !staffMayView(file.kind, requester)) throw new NotFoundException('File not found');

    return file;
  }

  /** One of this patient's own files of the given kinds; anything else is "not found", whoever asks. */
  async findOwned(patientId: string, id: string, kinds: UploadKind[]) {
    const file = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!file || file.patientId !== patientId || !kinds.includes(file.kind)) throw new NotFoundException('File not found');
    return file;
  }

  /**
   * Deletes a file's bytes and its record (a retaken photo, so a discarded body photo doesn't linger). The bytes
   * go first: if the storage fails, the record stays, so the file can still be found and removed later.
   */
  async remove(file: { id: string; storageKey: string }): Promise<void> {
    await this.storage.delete(file.storageKey);
    await this.prisma.uploadedFile.deleteMany({ where: { id: file.id } });
  }

  async readContents(file: { storageKey: string }): Promise<Buffer> {
    return this.decrypt(await this.storage.get(file.storageKey));
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
