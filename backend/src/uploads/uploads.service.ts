import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadKind } from '@prisma/client';

const UPLOAD_ROOT = join(process.cwd(), 'uploads');

@Injectable()
export class UploadsService {
  constructor(private prisma: PrismaService) {}

  async save(patientId: string, kind: UploadKind, file: Express.Multer.File) {
    const dir = join(UPLOAD_ROOT, patientId);
    await mkdir(dir, { recursive: true });

    const storageKey = `${patientId}/${randomUUID()}-${file.originalname}`;
    await writeFile(join(UPLOAD_ROOT, storageKey), file.buffer);

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

    return { ...file, absolutePath: join(UPLOAD_ROOT, file.storageKey) };
  }
}
