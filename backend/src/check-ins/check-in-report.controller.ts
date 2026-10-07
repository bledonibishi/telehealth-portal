import { Controller, ForbiddenException, Get, Param, Req, Res, StreamableFile } from '@nestjs/common';
import { Request, Response } from 'express';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, PRESCRIBERS } from '../auth/access-roles';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../common/enums';
import { CheckInReportService } from './check-in-report.service';

@Controller('check-ins')
export class CheckInReportController {
  constructor(
    private reports: CheckInReportService,
    private audit: AuditService,
  ) {}

  // The patient it is about, and the doctors: not support or fulfilment staff.
  @Authorized(...PRESCRIBERS, 'PATIENT')
  @Get(':id/report')
  async report(@Req() req: Request & { user: AuthUser }, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const checkIn = await this.reports.load(id);
    if (req.user.role === UserRole.PATIENT && checkIn.patientId !== req.user.id) throw new ForbiddenException();

    await this.audit.log({
      actorId: req.user.id,
      actorRole: req.user.role as UserRole,
      action: 'CHECK_IN_REPORT_VIEWED',
      resourceType: 'CheckIn',
      resourceId: id,
      patientId: checkIn.patientId,
    });

    const pdf = await this.reports.render(await this.reports.build(checkIn));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="check-in-report-${id}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(pdf);
  }
}
