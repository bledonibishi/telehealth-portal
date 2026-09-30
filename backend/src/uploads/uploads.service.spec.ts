import { mkdtempSync, rmSync } from 'fs';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadsService, safeFilename } from './uploads.service';

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
    const service = new UploadsService(prisma, config(Buffer.alloc(32, 7).toString('base64')));
    const saved = await service.save('p-1', 'ID_DOCUMENT' as any, file);

    const onDisk = await readFile(join(dir, saved.storageKey));
    expect(onDisk.includes(Buffer.from('secret image bytes'))).toBe(false);
    expect(await service.readContents(saved)).toEqual(file.buffer);
  });

  it('still reads files stored before encryption was enabled', async () => {
    const plain = await new UploadsService(prisma, config(undefined)).save('p-1', 'SELFIE' as any, file);
    const withKey = new UploadsService(prisma, config(Buffer.alloc(32, 7).toString('base64')));
    expect(await withKey.readContents(plain)).toEqual(file.buffer);
  });

  it('rejects a key of the wrong length', () => {
    expect(() => new UploadsService(prisma, config(Buffer.alloc(16).toString('base64')))).toThrow(/32 bytes/);
  });
});
