import { BadRequestException, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { IdentityVerificationController } from './identity-verification.controller';

const SECRET = 'whsec_test';

const payload = (over: Record<string, unknown> = {}) => ({
  eventId: 'evt-1',
  type: 'session.status_changed',
  sessionId: 'sess-1',
  externalRef: 'p1',
  status: 'APPROVED',
  occurredAt: new Date().toISOString(),
  review: { decision: 'APPROVED', reason: null, decidedAt: new Date().toISOString() },
  verification: { faceMatch: 'pass' },
  ...over,
});

function signed(body: object, secret = SECRET) {
  const raw = Buffer.from(JSON.stringify(body));
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.`).update(raw).digest('hex');
  return { req: { rawBody: raw, body } as any, header: `t=${t},v1=${v1}` };
}

describe('IdentityVerificationController', () => {
  let service: { handleWebhook: jest.Mock };
  let config: { get: jest.Mock };
  let controller: IdentityVerificationController;

  beforeEach(() => {
    service = { handleWebhook: jest.fn().mockResolvedValue('applied') };
    config = { get: jest.fn((k: string) => (k === 'VERIFY_WEBHOOK_SECRET' ? SECRET : undefined)) };
    controller = new IdentityVerificationController(config as any, service as any);
  });

  it('processes a correctly signed event once and acknowledges it', async () => {
    const { req, header } = signed(payload());
    await expect(controller.handleWebhook(req, header)).resolves.toEqual({ received: true });
    expect(service.handleWebhook).toHaveBeenCalledTimes(1);
    const arg = service.handleWebhook.mock.calls[0][0];
    expect(arg).toMatchObject({ eventId: 'evt-1', sessionId: 'sess-1', status: 'APPROVED' });
    expect(arg.occurredAt).toBeInstanceOf(Date);
  });

  it('rejects a wrong signature with 400 and changes nothing', async () => {
    const { req } = signed(payload());
    const wrong = `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`;
    await expect(controller.handleWebhook(req, wrong)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.handleWebhook).not.toHaveBeenCalled();
  });

  it('rejects a body edited by one byte after signing', async () => {
    const { req, header } = signed(payload());
    req.rawBody = Buffer.from(req.rawBody.toString().replace('APPROVED', 'APPROVEd'));
    await expect(controller.handleWebhook(req, header)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.handleWebhook).not.toHaveBeenCalled();
  });

  it('rejects a signature made with a different secret, or none at all', async () => {
    const other = signed(payload(), 'whsec_other');
    await expect(controller.handleWebhook(other.req, other.header)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.handleWebhook(other.req, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the raw body is not available', async () => {
    await expect(controller.handleWebhook({ body: payload() } as any, 'x')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses everything when the webhook secret is not configured', async () => {
    config.get.mockReturnValue(undefined);
    const { req, header } = signed(payload());
    await expect(controller.handleWebhook(req, header)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(service.handleWebhook).not.toHaveBeenCalled();
  });

  it.each([
    ['missing eventId', { eventId: undefined }],
    ['missing sessionId', { sessionId: undefined }],
    ['unknown status', { status: 'MAYBE' }],
    ['bad date', { occurredAt: 'yesterday' }],
    ['non-string id', { eventId: 123 }],
  ])('rejects a signed but malformed payload (%s)', async (_label, over) => {
    const { req, header } = signed(payload(over));
    await expect(controller.handleWebhook(req, header)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.handleWebhook).not.toHaveBeenCalled();
  });

  it('acknowledges event types it does not handle so they are not retried', async () => {
    const { req, header } = signed(payload({ type: 'session.something_new' }));
    await expect(controller.handleWebhook(req, header)).resolves.toEqual({ received: true });
    expect(service.handleWebhook).not.toHaveBeenCalled();
  });

  it('answers 5xx when processing fails so verify-service retries', async () => {
    service.handleWebhook.mockRejectedValue(new Error('db down'));
    const { req, header } = signed(payload());
    await expect(controller.handleWebhook(req, header)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('answers 2xx for a duplicate delivery', async () => {
    service.handleWebhook.mockResolvedValue('duplicate');
    const { req, header } = signed(payload());
    await expect(controller.handleWebhook(req, header)).resolves.toEqual({ received: true });
  });

  it('never passes document data or the reviewer’s free text beyond what it needs', async () => {
    const { req, header } = signed(payload({ review: { reason: 'x'.repeat(5000), decidedAt: 'not a date' } }));
    await controller.handleWebhook(req, header);
    const arg = service.handleWebhook.mock.calls[0][0];
    expect(arg.review.reason).toHaveLength(1000);
    expect(arg.review.decidedAt).toBeNull();
    expect(arg).not.toHaveProperty('verification');
  });
});
