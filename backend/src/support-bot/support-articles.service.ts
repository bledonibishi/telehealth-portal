import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/access-roles';
import { UserRole } from '../common/enums';
import { appError, ErrorCode } from '../common/errors/app-error';
import { overpromises } from './answer-guard';
import { DEFAULT_ARTICLES, type SupportArticle } from './support-knowledge';

const CACHE_MS = 30_000;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,39}$/;

/** What the assistant may tell a patient. The team edits these; the assistant reads the active ones (kept for a few seconds so it does not ask every time). */
@Injectable()
export class SupportArticlesService {
  private cache: { at: number; items: SupportArticle[] } | null = null;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** The starting articles are put in the database once, the first time anything needs them. */
  private async ensureDefaults() {
    if ((await this.prisma.supportArticle.count()) > 0) return;
    await this.prisma.supportArticle.createMany({ data: DEFAULT_ARTICLES.map((a) => ({ id: a.id, title: a.title, body: a.body, handoff: !!a.handoff })), skipDuplicates: true });
  }

  /** Every article, active or not, for the people who edit them. */
  async list() {
    await this.ensureDefaults();
    return this.prisma.supportArticle.findMany({ orderBy: [{ active: 'desc' }, { title: 'asc' }] });
  }

  /** The articles the assistant answers from now. */
  async active(): Promise<SupportArticle[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.items;
    await this.ensureDefaults();
    const rows = await this.prisma.supportArticle.findMany({ where: { active: true }, orderBy: { title: 'asc' } });
    const items = rows.map((r) => ({ id: r.id, title: r.title, body: r.body, handoff: r.handoff }));
    this.cache = { at: Date.now(), items };
    return items;
  }

  async save(user: AuthUser, input: { id: string; title: string; body: string; handoff?: boolean }) {
    const id = input.id.trim().toLowerCase();
    const title = input.title.trim();
    const body = input.body.trim();
    if (!ID_PATTERN.test(id)) throw appError(ErrorCode.BAD_REQUEST, 'The short name can use lowercase letters, numbers and dashes (3 to 40 characters).');
    if (title.length < 3 || title.length > 120) throw appError(ErrorCode.BAD_REQUEST, 'The title needs 3 to 120 characters.');
    if (body.length < 20 || body.length > 1200) throw appError(ErrorCode.BAD_REQUEST, 'The article needs 20 to 1200 characters.');
    // An article describes what the patient can do. It must not promise what "we" will do, or ask for personal details.
    if (overpromises(body)) throw appError(ErrorCode.BAD_REQUEST, 'An article should say what the patient can do, not promise that we will do something, and never ask for their email, password or card details.');

    const existing = await this.prisma.supportArticle.findUnique({ where: { id }, select: { id: true } });
    const row = await this.prisma.supportArticle.upsert({
      where: { id },
      create: { id, title, body, handoff: !!input.handoff, updatedById: user.id },
      update: { title, body, handoff: !!input.handoff, updatedById: user.id },
    });
    this.cache = null;
    await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: existing ? 'SUPPORT_ARTICLE_EDITED' : 'SUPPORT_ARTICLE_CREATED', resourceType: 'SupportArticle', resourceId: id });
    return row;
  }

  async setActive(user: AuthUser, id: string, active: boolean) {
    const row = await this.prisma.supportArticle.update({ where: { id }, data: { active, updatedById: user.id } }).catch(() => null);
    if (!row) throw appError(ErrorCode.NOT_FOUND, 'That article doesn’t exist.');
    this.cache = null;
    await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: active ? 'SUPPORT_ARTICLE_ACTIVATED' : 'SUPPORT_ARTICLE_DEACTIVATED', resourceType: 'SupportArticle', resourceId: id });
    return row;
  }
}
