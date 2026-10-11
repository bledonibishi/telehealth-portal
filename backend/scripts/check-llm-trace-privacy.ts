/**
 * Runs a document read and a body-photo check with tracing on, against a local stand-in for Langfuse, and prints what
 * would have been sent as JSON ({ sent }). Nothing leaves the machine. Used by src/langfuse/llm-tracing.service.spec.ts;
 * also handy by hand: `npx ts-node -T -P tsconfig.json scripts/check-llm-trace-privacy.ts`.
 * (It is a script and not a spec because the OpenTelemetry exporter loads its HTTP transport with a dynamic import(),
 * which Jest's VM cannot run.)
 */
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { PostHogLoggerService } from '../src/posthog/posthog-logger.service';
import { LlmTracingService } from '../src/langfuse/llm-tracing.service';
import { PhotoCheckService } from '../src/onboarding/photo-check.service';
import { ProofReaderService } from '../src/onboarding/proof-reader.service';

const configWith = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;

async function main() {
  const received: Buffer[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push(Buffer.concat(chunks));
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // PostHog's logger starts its own OpenTelemetry NodeSDK; tracing must still work next to it.
  new PostHogLoggerService(configWith({ POSTHOG_API_KEY: 'phc_test', POSTHOG_HOST: base }));
  const tracing = new LlmTracingService(configWith({ LANGFUSE_PUBLIC_KEY: 'pk-test', LANGFUSE_SECRET_KEY: 'sk-test', LANGFUSE_BASE_URL: base }));

  // 1. A prescription document, whose answer holds a name, a medicine, a dose and a date.
  const reader = new ProofReaderService(configWith({ ANTHROPIC_API_KEY: 'test-key' }), tracing);
  const answer = { readable: true, is_prescription_evidence: true, patient_name: 'Zoltan Qwerty', medicine_name: 'ZZ-MEDICINE-MARK', molecule: 'tirzepatide', dose_mg: 7.5, document_date: '2026-09-01', date_kind: 'dispensed', authenticity_concerns: [], notes: 'Boots Pharmacy Prishtina' };
  (reader as any).client = { beta: { messages: { create: async () => ({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 90 }, content: [{ type: 'text', text: JSON.stringify(answer) }] }) } } };
  const document = Buffer.from('DOCUMENT-BYTES-'.repeat(200));
  const read = await reader.read(document, 'image/jpeg', 'patient-123');

  // 2. A body photo.
  const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('PHOTO-BYTES-'.repeat(200))]);
  const prisma: any = { bodyPhotoCheck: { create: async () => ({ id: 'c-1' }), update: async () => ({}), count: async () => 0, findFirst: async () => null } };
  const uploads: any = { findOwned: async () => ({ id: 'f-1', storageKey: 'p/f-1' }), readContents: async () => photo };
  const detector: any = { available: async () => true, detect: async () => ({}), name: 'pose' };
  const photos = new PhotoCheckService(prisma, uploads, configWith({ PHOTO_CHECK_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'test-key' }), detector, tracing);
  photos.useClient({ messages: { create: async () => ({ model: 'claude-haiku-4-5', usage: { input_tokens: 800, output_tokens: 60 }, content: [{ type: 'tool_use', name: 'describe_photo', input: { person_count: 1, face_visible: true, head_to_toe_visible: true, pose: 'front', bulky_or_baggy_clothing: false, quality: 'good', not_a_real_photo: false } }] }) } } as any);
  const checked = await photos.check('patient-123', 'f-1', 'FRONT');

  await tracing.onApplicationShutdown(); // flushes
  await new Promise((r) => setTimeout(r, 300));
  server.close();
  console.log(JSON.stringify({ appGotIt: read.status === 'COMPLETED' && read.reading.patientName === 'Zoltan Qwerty' && read.reading.doseMg === 7.5, photoOutcome: checked.outcome, documentBase64: document.toString('base64'), photoBase64: photo.toString('base64'), sent: Buffer.concat(received).toString('latin1') }));
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
