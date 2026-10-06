import { ConfigService } from '@nestjs/config';
import { ProofReaderService, toReading } from './proof-reader.service';

const configWith = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('ProofReaderService', () => {
  it('routes to manual review without an API key, without calling the API', async () => {
    const reader = new ProofReaderService(configWith({}));
    await expect(reader.read(Buffer.from('x'), 'image/jpeg')).resolves.toEqual({ status: 'NOT_CONFIGURED', reason: expect.any(String) });
  });

  it('does not send file types the API cannot read', async () => {
    const reader = new ProofReaderService(configWith({ ANTHROPIC_API_KEY: 'test-key' }));
    await expect(reader.read(Buffer.from('x'), 'image/heic')).resolves.toMatchObject({ status: 'UNSUPPORTED_FILE' });
    await expect(reader.read(Buffer.alloc(6 * 1024 * 1024), 'image/jpeg')).resolves.toMatchObject({ status: 'UNSUPPORTED_FILE' });
  });
});

describe('toReading', () => {
  it('drops malformed dates and non-positive doses rather than trusting them', () => {
    const r = toReading({
      readable: true,
      is_prescription_evidence: true,
      patient_name: 'Ann Lee',
      medicine_name: 'Mounjaro',
      molecule: 'tirzepatide',
      dose_mg: 0,
      document_date: '20/09/2026',
      date_kind: 'dispensed',
      authenticity_concerns: [],
      notes: '',
    });
    expect(r.doseMg).toBeNull();
    expect(r.documentDate).toBeNull();
    expect(r.patientName).toBe('Ann Lee');
  });
});

describe('ProofReaderService model choice', () => {
  const answer = JSON.stringify({
    readable: true, is_prescription_evidence: true, patient_name: 'Ann Lee', medicine_name: 'Mounjaro', molecule: 'tirzepatide',
    dose_mg: 2.5, document_date: '2026-09-20', date_kind: 'dispensed', authenticity_concerns: [], notes: '',
  });

  // A fake client in place of the real one, so no request leaves the test.
  const readerFor = (model?: string) => {
    const reader = new ProofReaderService(configWith({ ANTHROPIC_API_KEY: 'test-key', ...(model ? { PROOF_READER_MODEL: model } : {}) }));
    const create = jest.fn(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: answer }] }));
    (reader as any).client = { beta: { messages: { create } } };
    return { reader, create };
  };

  it('defaults to Sonnet 5.5 with effort and refusal fallbacks', async () => {
    const { reader, create } = readerFor();
    await expect(reader.read(Buffer.from('x'), 'image/jpeg')).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5-5', fallbacks: 'default', output_config: expect.objectContaining({ effort: 'medium' }) }),
    );
  });

  it('sends Haiku 4.5 only the options it accepts', async () => {
    const { reader, create } = readerFor('claude-haiku-4-5');
    await reader.read(Buffer.from('x'), 'image/jpeg');
    const params = (create.mock.calls[0] as any[])[0];
    expect(params.model).toBe('claude-haiku-4-5');
    expect(params).not.toHaveProperty('fallbacks');
    expect(params).not.toHaveProperty('betas');
    expect(params.output_config).not.toHaveProperty('effort');
  });
});
