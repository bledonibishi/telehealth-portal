import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DASHBOARD_WIDGETS, DashboardLayout, DashboardOverride, activeOverrides, applyOverrides, defaultLayout, normalizeLayout } from '@telehealth/shared-types';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/access-roles';
import { UserRole } from '../common/enums';
import { appError, ErrorCode } from '../common/errors/app-error';
import { PrismaService } from '../prisma/prisma.service';

/** How a patient has arranged the cards on their home screen. Only their choices are stored; the rest comes from the app. */
@Injectable()
export class DashboardLayoutService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** The patient's own arrangement: what they saved, made complete and valid, or everything in the app's own order. */
  async get(patientId: string): Promise<DashboardLayout> {
    const row = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { dashboardLayout: true } });
    return row?.dashboardLayout ? normalizeLayout(row.dashboardLayout) : defaultLayout();
  }

  /** What the patient is shown: their arrangement with support's holds applied, and which cards support is hiding for now. */
  async getForPatient(patientId: string, now = new Date()) {
    const row = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { dashboardLayout: true, dashboardOverrides: true } });
    const layout = row?.dashboardLayout ? normalizeLayout(row.dashboardLayout) : defaultLayout();
    return applyOverrides(layout, activeOverrides(row?.dashboardOverrides, now));
  }

  /** For support: every card, and whether the patient or support has taken it off for now. */
  async cardsFor(patientId: string, now = new Date()) {
    const row = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { dashboardLayout: true, dashboardOverrides: true } });
    if (!row) throw appError(ErrorCode.NOT_FOUND, 'That patient doesn’t exist.');
    const layout = row.dashboardLayout ? normalizeLayout(row.dashboardLayout) : defaultLayout();
    const overrides = activeOverrides(row.dashboardOverrides, now);
    return DASHBOARD_WIDGETS.map((w) => {
      const o = overrides.find((x) => x.id === w.id);
      const state = o ? (o.mode === 'HIDE' ? 'HIDDEN_BY_SUPPORT' : 'SHOWN_BY_SUPPORT') : layout.hidden.includes(w.id) ? 'HIDDEN_BY_PATIENT' : 'SHOWING';
      return { id: w.id, title: w.title, state, canHide: !w.staffCannotHide, until: o?.until ?? null, reason: o?.reason ?? null };
    });
  }

  /**
   * Support hides a card for a while, shows one the patient took off, or lifts an earlier hold. A hold always ends by itself
   * (at most 30 days), is written in the audit log with its reason, and never touches the patient's own arrangement.
   * Treatment and emergency cards can't be hidden by support.
   */
  async setHold(user: AuthUser, patientId: string, input: { cardId: string; action: 'HIDE' | 'SHOW' | 'CLEAR'; days?: number | null; reason?: string | null }) {
    const widget = DASHBOARD_WIDGETS.find((w) => w.id === input.cardId);
    if (!widget) throw appError(ErrorCode.BAD_REQUEST, 'That card doesn’t exist.');
    if (input.action === 'HIDE' && widget.staffCannotHide) throw appError(ErrorCode.FORBIDDEN, `“${widget.title}” holds treatment or safety information, so support can’t hide it from a patient.`);
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { dashboardOverrides: true } });
    if (!patient) throw appError(ErrorCode.NOT_FOUND, 'That patient doesn’t exist.');

    const now = new Date();
    const kept = activeOverrides(patient.dashboardOverrides, now).filter((o) => o.id !== input.cardId);
    let next: DashboardOverride[] = kept;
    if (input.action !== 'CLEAR') {
      const reason = input.reason?.trim() ?? '';
      if (reason.length < 5) throw appError(ErrorCode.BAD_REQUEST, 'Say why, so the team can see it later (at least 5 characters).');
      const days = Math.round(input.days ?? 0);
      if (days < 1 || days > 30) throw appError(ErrorCode.BAD_REQUEST, 'Choose how long it lasts: 1 to 30 days.');
      next = [...kept, { id: input.cardId, mode: input.action, until: new Date(now.getTime() + days * 86_400_000).toISOString(), reason: reason.slice(0, 300), byId: user.id, at: now.toISOString() }];
    }
    await this.prisma.patient.update({ where: { id: patientId }, data: { dashboardOverrides: next as unknown as Prisma.InputJsonValue } });
    await this.audit.log({
      actorId: user.id, actorRole: UserRole.CLINICIAN, action: `DASHBOARD_CARD_${input.action}`, resourceType: 'Patient', resourceId: patientId, patientId,
      metadata: { card: input.cardId, ...(input.action !== 'CLEAR' ? { days: input.days, reason: input.reason?.trim() } : {}) },
    });
    return this.cardsFor(patientId, now);
  }

  /**
   * Saves their arrangement. Whatever arrives is made valid first, so a card that must always be shown can never be
   * taken off, and a card that doesn't exist or sits in the wrong place is dropped.
   */
  async save(patientId: string, input: Partial<DashboardLayout>): Promise<DashboardLayout> {
    const layout = normalizeLayout(input);
    await this.prisma.patient.update({ where: { id: patientId }, data: { dashboardLayout: layout as unknown as Prisma.InputJsonValue } });
    return layout;
  }

  /** Back to the app's own arrangement. */
  async reset(patientId: string): Promise<DashboardLayout> {
    await this.prisma.patient.update({ where: { id: patientId }, data: { dashboardLayout: Prisma.DbNull } });
    return defaultLayout();
  }
}
