import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/access-roles';
import { UserRole } from '../common/enums';
import { appError, ErrorCode } from '../common/errors/app-error';

const MAX_REPLIES = 100;
/** The start of the list, so a new team has something to begin from. Plain and general: nothing here states a policy. */
export const STARTER_REPLIES = [
  { title: 'Looking into it', body: 'Hello {name}, thank you for getting in touch. I’m looking into this now and will come back to you here as soon as I know more.' },
  { title: 'Need a little more detail', body: 'Hello {name}, thank you for your message. To help you, could you tell me a little more about what happened, and send a photo or screenshot if you can?' },
  { title: 'Asking them to check their email', body: 'Hello {name}, we’ve sent you an email. Please check your inbox and your spam folder, and let me know here if it hasn’t arrived.' },
  { title: 'Passed to a colleague', body: 'Hello {name}, I’ve passed this to a colleague who can help with it better than I can. They will reply to you here.' },
  { title: 'Closing the conversation', body: 'Hello {name}, I’m glad we could sort this out. If you need anything else, write to us here at any time.' },
];

/** Ready-made answers for the support team. The name of the patient goes where {name} is. */
@Injectable()
export class SavedRepliesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list() {
    if ((await this.prisma.savedReply.count()) === 0) {
      // Under a lock, so two people opening the list for the first time together don't both add the starter set.
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(727001)`;
        if ((await tx.savedReply.count()) === 0) await tx.savedReply.createMany({ data: STARTER_REPLIES.map((r) => ({ ...r, createdById: 'system' })) });
      });
    }
    return this.prisma.savedReply.findMany({ orderBy: { title: 'asc' } });
  }

  async save(user: AuthUser, input: { id?: string | null; title: string; body: string }) {
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 2 || title.length > 80) throw appError(ErrorCode.BAD_REQUEST, 'The title needs 2 to 80 characters.');
    if (body.length < 5 || body.length > 1500) throw appError(ErrorCode.BAD_REQUEST, 'The reply needs 5 to 1500 characters.');
    if (input.id) {
      const row = await this.prisma.savedReply.update({ where: { id: input.id }, data: { title, body } }).catch(() => null);
      if (!row) throw appError(ErrorCode.NOT_FOUND, 'That saved reply doesn’t exist.');
      await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'SAVED_REPLY_EDITED', resourceType: 'SavedReply', resourceId: row.id });
      return row;
    }
    if ((await this.prisma.savedReply.count()) >= MAX_REPLIES) throw appError(ErrorCode.BAD_REQUEST, `There are already ${MAX_REPLIES} saved replies. Remove one you don’t use first.`);
    const row = await this.prisma.savedReply.create({ data: { title, body, createdById: user.id } });
    await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'SAVED_REPLY_CREATED', resourceType: 'SavedReply', resourceId: row.id });
    return row;
  }

  async remove(user: AuthUser, id: string) {
    const gone = await this.prisma.savedReply.deleteMany({ where: { id } });
    if (gone.count === 0) throw appError(ErrorCode.NOT_FOUND, 'That saved reply doesn’t exist.');
    await this.audit.log({ actorId: user.id, actorRole: UserRole.CLINICIAN, action: 'SAVED_REPLY_REMOVED', resourceType: 'SavedReply', resourceId: id });
    return true;
  }
}
