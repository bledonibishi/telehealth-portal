import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TOKEN_FORMAT = /^Expo(nent)?PushToken\[[\w-]+\]$/;

export type PushMessage = {
  title: string;
  body: string;
  /** Only what the app needs to open the right screen. */
  data?: Record<string, string>;
};

/**
 * Tells a patient's phone something happened. The words are always general (never a medicine, a name or an address),
 * because they show on a locked screen; the app fetches the details once opened. A failure here never undoes what
 * caused it: the email and the app itself still say the same thing.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  async register(patientId: string, token: string, platform: string) {
    if (!TOKEN_FORMAT.test(token)) throw new BadRequestException('That is not a valid push token');
    const os = platform === 'ios' || platform === 'android' ? platform : null;
    if (!os) throw new BadRequestException('Platform must be ios or android');
    // The token is the phone: if someone else signed in on it before, it is theirs no longer.
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { patientId, token, platform: os },
      update: { patientId, platform: os, lastSeenAt: new Date() },
    });
    return true;
  }

  /** Only removes the caller's own registration. */
  async unregister(patientId: string, token: string) {
    await this.prisma.pushDevice.deleteMany({ where: { patientId, token } });
    return true;
  }

  async sendToPatient(patientId: string, message: PushMessage): Promise<void> {
    try {
      const devices = await this.prisma.pushDevice.findMany({ where: { patientId }, select: { token: true } });
      if (devices.length === 0) return;

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(devices.map((d) => ({ to: d.token, sound: 'default', priority: 'high', title: message.title, body: message.body, data: message.data ?? {} }))),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Expo answered ${res.status}`);

      // A phone that has uninstalled the app is reported per message: forget it so we stop trying.
      const body = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
      const gone = (body.data ?? []).flatMap((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? [devices[i].token] : []));
      if (gone.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: gone } } });
    } catch (err: any) {
      this.logger.warn(`Push to patient ${patientId} failed: ${err?.message}`);
    }
  }
}
