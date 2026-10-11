import { execFileSync } from 'child_process';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { LlmTracingService, maskTraceData } from './llm-tracing.service';

const configWith = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('maskTraceData', () => {
  it('removes binary data and email addresses from text, and leaves the rest', () => {
    const out = maskTraceData({ data: `see data:image/jpeg;base64,${'QUJD'.repeat(200)} and ann@example.com, dose ok` }) as string;
    expect(out).toBe('see [removed: binary data] and [removed: email], dose ok');
  });
});

describe('LlmTracingService', () => {
  it('is off without keys, and then just runs the work', async () => {
    const tracing = new LlmTracingService(configWith({}));
    expect(tracing.enabled).toBe(false);
    await expect(tracing.trace('x', {}, async () => 42)).resolves.toBe(42);
    await expect(tracing.generation('y', { model: 'm', input: 'i' }, async () => 7)).resolves.toBe(7);
  });

  it('can be switched off while keys are set', () => {
    expect(new LlmTracingService(configWith({ LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk', LANGFUSE_TRACING_ENABLED: 'false' })).enabled).toBe(false);
  });
});

// Runs real reads and checks against a local stand-in for Langfuse, in its own process, and looks at the bytes sent.
describe('what the LLM calls send to Langfuse', () => {
  const backend = join(__dirname, '../..');
  const run = () => JSON.parse(execFileSync(join(backend, 'node_modules/.bin/ts-node'), ['-T', '-P', 'tsconfig.json', 'scripts/check-llm-trace-privacy.ts'], { cwd: backend, encoding: 'utf8', env: { ...process.env, LANGFUSE_PUBLIC_KEY: '', LANGFUSE_SECRET_KEY: '' } }).trim().split('\n').pop()!);

  it('has the model, tokens and a summary, but never a photo, a document or what a document says', () => {
    const r = run();
    expect(r.appGotIt).toBe(true); // the app itself still gets the full reading
    expect(r.photoOutcome).toBe('PASS');

    // what we want in Langfuse
    for (const wanted of ['read-prescription-document', 'extract-document-fields', 'check-body-photo', 'describe-body-photo', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'patient-123', '1200']) expect(r.sent).toContain(wanted);
    // what must never leave
    for (const secret of [r.documentBase64, r.photoBase64, 'DOCUMENT-BYTES', 'PHOTO-BYTES', 'Zoltan', 'Qwerty', 'ZZ-MEDICINE-MARK', 'Boots', '2026-09-01']) expect(r.sent).not.toContain(secret);
  }, 60_000);
});
