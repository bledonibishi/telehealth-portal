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
import { createReadStream } from 'fs';
import { UploadKind } from '@prisma/client';
import { UploadsService } from './uploads.service';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

@Controller('uploads')
export class UploadsController {
  constructor(private uploads: UploadsService) {}

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
    res.setHeader('Content-Type', file.mimeType);
    return new StreamableFile(createReadStream(file.absolutePath));
  }
}
