import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
  UploadedFile as UploadedFileDecorator,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { UploadKind } from '@prisma/client';
import { UploadsService } from './uploads.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

@Controller('uploads')
export class UploadsController {
  constructor(
    private uploads: UploadsService,
    private audit: AuditService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  async upload(
    @Req() req: Request & { user: { id: string; role: string } },
    @Body('kind') kind: string,
    @UploadedFileDecorator() file: Express.Multer.File,
  ) {
    if (req.user.role !== 'PATIENT') throw new BadRequestException('Only patients can upload onboarding documents');
    if (!file) throw new BadRequestException('No file provided');
    if (!Object.values(UploadKind).includes(kind as UploadKind)) {
      throw new BadRequestException('Invalid upload kind');
    }

    const saved = await this.uploads.save(req.user.id, kind as UploadKind, file);
    return { id: saved.id };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/file')
  async getFile(
    @Req() req: Request & { user: { id: string; role: string } },
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.uploads.findForAccess(id, req.user);
    // ID documents and body photos are among the most sensitive things we hold.
    await this.audit.log({
      actorId: req.user.id,
      actorRole: req.user.role as UserRole,
      action: 'FILE_VIEWED',
      resourceType: 'UploadedFile',
      resourceId: id,
      metadata: { kind: file.kind, patientId: file.patientId },
    });
    const contents = await this.uploads.readContents(file);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(contents);
  }
}
