import { mkdtempSync, rmSync } from 'fs';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FallbackFileStorage, FileNotFoundError, LocalFileStorage } from './file-storage';
import { UploadsService, looksLikeImage, safeFilename, staffMayView } from './uploads.service';

describe('safeFilename', () => {
  it('keeps names inside the patient folder', () => {
    expect(safeFilename('../../../../tmp/evil.sh')).toBe('evil.sh');
    expect(safeFilename('..\\..\\x.png')).not.toContain('/');
    expect(safeFilename('my passport (1).jpg')).toBe('my_passport_1_.jpg');
    expect(safeFilename('...')).toBe('file');
  });
});

describe('UploadsService encryption', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uploads-'));
  const file = { originalname: 'id.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('secret image bytes') } as Express.Multer.File;
  const prisma: any = { uploadedFile: { create: jest.fn(({ data }) => Promise.resolve({ id: 'f-1', ...data })) } };
  const config = (key?: string) =>
    ({ get: jest.fn((name: string) => (name === 'UPLOAD_DIR' ? dir : name === 'UPLOAD_ENCRYPTION_KEY' ? key : undefined)) }) as any;

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('stores ciphertext on disk and reads back the original', async () => {
    const service = new UploadsService(prisma, config(Buffer.alloc(32, 7).toString('base64')), new LocalFileStorage(dir));
    const saved = await service.save('p-1', 'ID_DOCUMENT' as any, file);

    const onDisk = await readFile(join(dir, saved.storageKey));
    expect(onDisk.includes(Buffer.from('secret image bytes'))).toBe(false);
    expect(await service.readContents(saved)).toEqual(file.buffer);
  });

  it('still reads files stored before encryption was enabled', async () => {
    const plain = await new UploadsService(prisma, config(undefined), new LocalFileStorage(dir)).save('p-1', 'SELFIE' as any, file);
    const withKey = new UploadsService(prisma, config(Buffer.alloc(32, 7).toString('base64')), new LocalFileStorage(dir));
    expect(await withKey.readContents(plain)).toEqual(file.buffer);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => new UploadsService(prisma, config(Buffer.alloc(16).toString('base64')), new LocalFileStorage(dir))).toThrow(/32 bytes/);
  });
});

const KEY = Buffer.alloc(32, 7).toString('base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const photo = (over: Partial<Express.Multer.File> = {}) => ({ originalname: 'me.jpg', mimetype: 'image/jpeg', buffer: JPEG, ...over }) as Express.Multer.File;

describe('UploadsService storage', () => {
  const prisma: any = {
    uploadedFile: { create: jest.fn(({ data }) => Promise.resolve({ id: 'f-1', ...data })), findUnique: jest.fn() },
  };
  const config = { get: jest.fn((name: string) => (name === 'UPLOAD_ENCRYPTION_KEY' ? KEY : undefined)) } as any;
  const memory = () => {
    const files = new Map<string, Buffer>();
    return { files, put: jest.fn(async (k: string, b: Buffer) => void files.set(k, b)), get: jest.fn(async (k: string) => files.get(k)!), delete: jest.fn(async (k: string) => void files.delete(k)) };
  };

  it('hands the storage backend only ciphertext, and decrypts what it returns', async () => {
    const storage = memory();
    const service = new UploadsService(prisma, config, storage);
    const saved = await service.save('p-1', 'PROGRESS_PHOTO' as any, photo());

    const stored = storage.files.get(saved.storageKey)!;
    expect(stored.includes(JPEG)).toBe(false);
    expect(await service.readContents(saved)).toEqual(JPEG);
  });

  it.each([
    ['a non-image type', photo({ mimetype: 'application/pdf' })],
    ['an image type with other contents', photo({ buffer: Buffer.from('<html>not a photo</html>') })],
  ])('refuses a progress photo that is %s', async (_n, file) => {
    const storage = memory();
    await expect(new UploadsService(prisma, config, storage).save('p-1', 'PROGRESS_PHOTO' as any, file)).rejects.toThrow(/photo/);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('refuses a progress photo over 10 MB', async () => {
    const big = photo({ buffer: Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]) });
    await expect(new UploadsService(prisma, config, memory()).save('p-1', 'PROGRESS_PHOTO' as any, big)).rejects.toThrow(/too large/);
  });
});

describe('UploadsService.remove', () => {
  const build = () => {
    const prisma: any = { uploadedFile: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const storage = { put: jest.fn(), get: jest.fn(), delete: jest.fn().mockResolvedValue(undefined) };
    return { prisma, storage, service: new UploadsService(prisma, { get: jest.fn() } as any, storage) };
  };

  it('deletes the stored bytes first, then the record', async () => {
    const { service, prisma, storage } = build();
    await service.remove({ id: 'f-1', storageKey: 'k' });
    expect(storage.delete).toHaveBeenCalledWith('k');
    expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(prisma.uploadedFile.deleteMany.mock.invocationCallOrder[0]);
  });

  it('keeps the record when the bytes cannot be deleted, so the file can still be found and removed later', async () => {
    const { service, prisma, storage } = build();
    storage.delete.mockRejectedValue(new Error('S3 down'));
    await expect(service.remove({ id: 'f-1', storageKey: 'k' })).rejects.toThrow('S3 down');
    expect(prisma.uploadedFile.deleteMany).not.toHaveBeenCalled();
  });
});

describe('looksLikeImage', () => {
  it('recognises JPEG, PNG, WebP and HEIC, and nothing else', () => {
    expect(looksLikeImage(JPEG)).toBe(true);
    expect(looksLikeImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(true);
    expect(looksLikeImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe(true);
    expect(looksLikeImage(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')]))).toBe(true);
    expect(looksLikeImage(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypmp42')]))).toBe(false); // a video, not a photo
    expect(looksLikeImage(Buffer.from('%PDF-1.7'))).toBe(false);
  });
});

describe('UploadsService.findForAccess', () => {
  const FILE = (kind: string) => ({ id: 'f-1', patientId: 'p-1', kind, storageKey: 'k', mimeType: 'image/jpeg' });
  const service = (kind: string) => {
    const prisma: any = { uploadedFile: { findUnique: jest.fn().mockResolvedValue(FILE(kind)) } };
    return new UploadsService(prisma, { get: jest.fn() } as any, { put: jest.fn(), get: jest.fn(), delete: jest.fn() });
  };
  const staff = (clinicianRole: string) => ({ id: 'c-1', role: 'CLINICIAN', clinicianRole }) as any;
  const patient = (id: string) => ({ id, role: 'PATIENT' }) as any;

  it.each(['PROGRESS_PHOTO', 'BODY_PHOTO_FRONT', 'BODY_PHOTO_SIDE'])('lets the patient and doctors open a %s, but not support or fulfilment staff', async (kind) => {
    expect(await service(kind).findForAccess('f-1', patient('p-1'))).toMatchObject({ id: 'f-1' });
    expect(await service(kind).findForAccess('f-1', staff('DOCTOR'))).toMatchObject({ id: 'f-1' });
    expect(await service(kind).findForAccess('f-1', staff('ADMIN'))).toMatchObject({ id: 'f-1' });
    await expect(service(kind).findForAccess('f-1', staff('CX_TEAM'))).rejects.toThrow('File not found');
    await expect(service(kind).findForAccess('f-1', staff('PROVIDER'))).rejects.toThrow('File not found');
  });

  it('never shows one patient’s file to another patient', async () => {
    await expect(service('PROGRESS_PHOTO').findForAccess('f-1', patient('p-2'))).rejects.toThrow('File not found');
  });

  it('refuses a clinician token that carries no clinical role', async () => {
    await expect(service('PROGRESS_PHOTO').findForAccess('f-1', { id: 'c-1', role: 'CLINICIAN' } as any)).rejects.toThrow('File not found');
  });

  it('keeps identity documents open to all staff, as the onboarding review needs', () => {
    for (const role of ['ADMIN', 'DOCTOR', 'CX_TEAM', 'PROVIDER']) expect(staffMayView('ID_DOCUMENT' as any, staff(role))).toBe(true);
  });
});

describe('FallbackFileStorage (S3 with the old disk behind it)', () => {
  const store = (files: Record<string, string> = {}) => {
    const map = new Map<string, Buffer>(Object.entries(files).map(([k, v]) => [k, Buffer.from(v)] as [string, Buffer]));
    return {
      put: jest.fn(async (k: string, b: Buffer) => void map.set(k, b)),
      get: jest.fn(async (k: string): Promise<Buffer> => { if (!map.has(k)) throw new FileNotFoundError(k); return map.get(k)!; }),
      delete: jest.fn(async (k: string) => void map.delete(k)),
    };
  };

  it('writes new files to the primary only', async () => {
    const primary = store(), legacy = store();
    await new FallbackFileStorage(primary, legacy).put('p/new', Buffer.from('x'));
    expect(primary.put).toHaveBeenCalled();
    expect(legacy.put).not.toHaveBeenCalled();
  });

  it('reads a file uploaded before the switch from the old disk, and never asks it for one the primary has', async () => {
    const primary = store({ 'p/new': 'in s3' }), legacy = store({ 'p/old': 'on disk' });
    const storage = new FallbackFileStorage(primary, legacy);
    expect((await storage.get('p/new')).toString()).toBe('in s3');
    expect(legacy.get).not.toHaveBeenCalled();
    expect((await storage.get('p/old')).toString()).toBe('on disk');
  });

  it('does not hide a real failure of the primary behind the old disk', async () => {
    const primary = store(), legacy = store({ 'p/x': 'old' });
    primary.get.mockRejectedValue(new Error('S3 is down'));
    await expect(new FallbackFileStorage(primary, legacy).get('p/x')).rejects.toThrow('S3 is down');
    expect(legacy.get).not.toHaveBeenCalled();
  });

  it('deletes from both', async () => {
    const primary = store({ a: '1' }), legacy = store({ a: '1' });
    await new FallbackFileStorage(primary, legacy).delete('a');
    expect(primary.delete).toHaveBeenCalledWith('a');
    expect(legacy.delete).toHaveBeenCalledWith('a');
  });
});
