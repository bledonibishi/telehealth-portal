import { Controller, ForbiddenException, Get, Param, Req, Res, StreamableFile } from '@nestjs/common';
import { Request, Response } from 'express';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, STAFF } from '../auth/access-roles';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { PrescriptionDocumentService } from './prescription-document.service';

@Controller('prescriptions')
export class PrescriptionDocumentController {
  constructor(
    private documents: PrescriptionDocumentService,
    private audit: AuditService,
  ) {}

  @Authorized(...STAFF, 'PATIENT')
  @Get(':id/document')
  async document(
    @Req() req: Request & { user: AuthUser },
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rx = await this.documents.load(id);
    if (req.user.role === UserRole.PATIENT && rx.patientId !== req.user.id) throw new ForbiddenException();

    await this.audit.log({
      actorId: req.user.id,
      actorRole: req.user.role as UserRole,
      action: 'PRESCRIPTION_DOCUMENT_VIEWED',
      resourceType: 'Prescription',
      resourceId: id,
    });

    const pdf = await this.documents.render(rx);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="prescription-${id}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(pdf);
  }
}
