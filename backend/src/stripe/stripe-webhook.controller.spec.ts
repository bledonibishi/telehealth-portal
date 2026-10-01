import Stripe from 'stripe';
import { StripeWebhookController } from './stripe-webhook.controller';

const SECRET = 'whsec_test_secret';
const config = {
  get: jest.fn((key: string) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_dummy' : key === 'STRIPE_WEBHOOK_SECRET' ? SECRET : undefined)),
};

function build() {
  const webhookService = { handle: jest.fn().mockResolvedValue(undefined) };
  const controller = new StripeWebhookController(config as any, webhookService as any);
  const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return { controller, webhookService, res };
}

const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.payment_succeeded', data: { object: { id: 'in_1' } } });
const sign = (body: string) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });

describe('StripeWebhookController', () => {
  it('verifies the signature against the raw body (not the parsed one) and handles the event', async () => {
    const { controller, webhookService, res } = build();
    // Nest hands over a parsed object as `body`; only `rawBody` is the signed bytes.
    const req: any = { rawBody: Buffer.from(payload), body: JSON.parse(payload) };

    await controller.handleWebhook(req, res, sign(payload));

    expect(webhookService.handle).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt_1', type: 'invoice.payment_succeeded' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('rejects a bad signature with 400', async () => {
    const { controller, webhookService, res } = build();
    await controller.handleWebhook({ rawBody: Buffer.from(payload) } as any, res, 't=1,v1=bad');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(webhookService.handle).not.toHaveBeenCalled();
  });

  it('rejects a request with no raw body', async () => {
    const { controller, res } = build();
    await controller.handleWebhook({ body: JSON.parse(payload) } as any, res, sign(payload));
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 when handling the event fails, so Stripe retries', async () => {
    const { controller, webhookService, res } = build();
    webhookService.handle.mockRejectedValue(new Error('boom'));
    await controller.handleWebhook({ rawBody: Buffer.from(payload) } as any, res, sign(payload));
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
