import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** The API version these calls were written against (Cal.com pins behaviour per version header). */
const API_VERSION = '2026-02-25';
const TIMEOUT_MS = 10_000;

/**
 * The few Cal.com API v2 calls the booking system makes itself. Picking a time happens in Cal.com's own
 * scheduler and changes reach us by webhook, so this is only for acting on a booking from our side.
 *   CALCOM_API_KEY  an API key from the Cal.com account (starts with "cal_")
 *   CALCOM_API_URL  defaults to https://api.cal.com/v2 (EU accounts: https://api.cal.eu/v2)
 */
@Injectable()
export class CalcomClient {
  private readonly logger = new Logger(CalcomClient.name);

  constructor(private config: ConfigService) {}

  get configured() {
    return !!this.config.get<string>('CALCOM_API_KEY')?.trim();
  }

  cancel(uid: string, reason?: string) {
    return this.call('POST', `/bookings/${encodeURIComponent(uid)}/cancel`, { cancellationReason: reason?.slice(0, 500) || 'Cancelled from the patient portal' });
  }

  get(uid: string) {
    return this.call('GET', `/bookings/${encodeURIComponent(uid)}`);
  }

  /** Everything booked under an attendee's email from a moment on, whatever its status (so cancellations are seen too). */
  async listForAttendee(email: string, afterStart: Date): Promise<any[]> {
    const q = new URLSearchParams({ attendeeEmail: email, afterStart: afterStart.toISOString(), sortStart: 'asc', take: '100' });
    const data = await this.call('GET', `/bookings?${q}`);
    return Array.isArray(data) ? data : [];
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    const key = this.config.get<string>('CALCOM_API_KEY')?.trim();
    if (!key) throw new ServiceUnavailableException('Scheduling is not set up');
    const base = (this.config.get<string>('CALCOM_API_URL')?.trim() || 'https://api.cal.com/v2').replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: { Authorization: `Bearer ${key}`, 'cal-api-version': API_VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Cal.com ${method} ${path} did not answer: ${(err as Error).message}`);
      throw new ServiceUnavailableException('The scheduling service is not answering — please try again');
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.status === 'error') {
      // The provider's message can name other people's bookings, so it is logged, not shown.
      this.logger.error(`Cal.com ${method} ${path} → ${res.status}: ${JSON.stringify(json?.error ?? json)?.slice(0, 300)}`);
      throw new ServiceUnavailableException('The scheduling service refused that — please try again or message us');
    }
    return json?.data ?? null;
  }
}
