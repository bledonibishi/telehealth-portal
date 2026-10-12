import { BadRequestException, Body, Controller, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';
import { LabsService } from './labs.service';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

@Controller('labs')
export class LabReportsController {
  constructor(private labs: LabsService) {}

  // A doctor attaches a patient's lab report (PDF or photo). The patient's own uploads go through /uploads and
  // submitMyLabReport instead, since the file is theirs to send.
  @Authorized(...PRESCRIBERS)
  @Post('reports')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }))
  async attach(@Req() req: Request & { user: AuthUser }, @Body('patientId') patientId: string, @Body('note') note: string | undefined, @UploadedFile() file: Express.Multer.File) {
    if (!patientId) throw new BadRequestException('Missing patientId');
    if (!file) throw new BadRequestException('No file provided');
    return this.labs.attachReport(req.user.id, patientId, file, note);
  }
}
