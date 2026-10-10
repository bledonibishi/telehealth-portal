/**
 * Runs the same prescription-proof photos through several Claude models and
 * prints what each one read, side by side — to pick PROOF_READER_MODEL.
 *
 *   cd backend
 *   pnpm compare-proof-models ./sample-proofs
 *   pnpm compare-proof-models ./sample-proofs claude-opus-5-5 claude-haiku-4-5
 *
 * Score against known answers: put `<image>.expected.json` next to an image (see eval/proof-reader/README.md, which also
 * explains `pnpm make-proof-test-set`, a ready-made synthetic set). Images that have one are scored, and each model
 * gets a summary of how often it was right, left a field for a clinician, or was confidently wrong.
 *
 * Uses ANTHROPIC_API_KEY from the environment, or else from backend/.env.
 *
 * Every image × model is one real (billed) API call. Use test documents or
 * documents you're allowed to send — not real patients' files.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { ProofReaderService } from '../src/onboarding/proof-reader.service';
import { type ExpectedReading, FIELDS, type FieldScores, scoreReading, summarise } from '../src/onboarding/proof-reader-scoring';

const DEFAULT_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5'];
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

async function main() {
  const [dir, ...models] = process.argv.slice(2);
  if (!dir) {
    console.error('Usage: pnpm compare-proof-models <folder of images> [model ...]');
    process.exit(1);
  }
  // Values already in the environment win over the file.
  const envFile = resolve(__dirname, '../.env');
  if (!process.env.ANTHROPIC_API_KEY && existsSync(envFile)) {
    (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Set ANTHROPIC_API_KEY in backend/.env or on the command line.');
    process.exit(1);
  }

  if (!existsSync(dir)) {
    console.error(`Folder ${resolve(dir)} doesn't exist. Create it and put a few test photos (.jpg, .png, .webp) in it.`);
    process.exit(1);
  }
  const images = readdirSync(dir).filter((f) => MIME[extname(f).toLowerCase()]);
  if (!images.length) {
    console.error(`No .jpg, .png, .webp or .gif files in ${dir}`);
    process.exit(1);
  }

  const modelList = models.length ? models : DEFAULT_MODELS;
  const results: Array<Record<string, unknown>> = [];
  const scored: Record<string, Array<{ image: string; scores: FieldScores }>> = Object.fromEntries(modelList.map((m) => [m, []]));
  const failedReads: Record<string, number> = Object.fromEntries(modelList.map((m) => [m, 0]));

  const readOne = async (image: string) => {
    const file = readFileSync(join(dir, image));
    const keyFile = join(dir, `${image}.expected.json`);
    const expected: ExpectedReading | null = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, 'utf8')) : null;
    const rows = await Promise.all(
      modelList.map(async (model) => {
        const env: Record<string, string> = { ANTHROPIC_API_KEY: apiKey, PROOF_READER_MODEL: model };
        const reader = new ProofReaderService({ get: (k: string) => env[k] } as unknown as ConfigService);
        const started = Date.now();
        const out = await reader.read(file, MIME[extname(image).toLowerCase()]);
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        const r = out.status === 'COMPLETED' ? out.reading : null;
        const scores = expected ? scoreReading(expected, r) : null;
        if (scores) scored[model].push({ image, scores });
        if (!r) failedReads[model]++;
        results.push({ image, model, seconds: Number(seconds), scores, ...out });
        const mark = (f: (typeof FIELDS)[number]) => (scores && scores[f] === 'wrong' ? ' ✗' : '');
        return {
          model,
          time: `${seconds}s`,
          status: out.status === 'COMPLETED' ? (r!.readable ? 'read' : 'unreadable') : `${out.status}: ${out.reason}`,
          name: (r?.patientName ?? '—') + mark('patientName'),
          medicine: r?.medicineName ?? '—',
          dose: (r?.doseMg != null ? `${r.doseMg} mg` : '—') + mark('doseMg'),
          date: (r?.documentDate ? `${r.documentDate} (${r.dateKind})` : '—') + mark('documentDate'),
          concerns: (r?.authenticityConcerns.join('; ') || '—') + mark('flagsConcerns'),
        };
      }),
    );
    console.log(`\n━━ ${image}${expected ? '   (✗ = differs from the answer key)' : ''}`);
    console.table(rows);
  };

  // A few documents at a time: quicker than one by one, without hitting rate limits.
  const queue = [...images];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { for (let image = queue.shift(); image; image = queue.shift()) await readOne(image); }));

  const keyed = Object.values(scored)[0]?.length ?? 0;
  if (keyed) {
    console.log(`\n━━ Scores against the answer key (${keyed} documents)`);
    console.log('   wrong = a confident error (the number to push to zero); left to clinician = nothing read, or a false alarm');
    console.table(
      modelList.map((model) => {
        const s = summarise(scored[model].map((x) => x.scores));
        return {
          model,
          'reads failed': `${failedReads[model]}/${s.documents}`,
          'docs with any error': `${s.documentsWithAnError}/${s.documents}`,
          'wrong dose or date': `${s.documentsWithWrongDoseOrDate}/${s.documents}`,
          ...Object.fromEntries(FIELDS.map((f) => [f, `${s.fields[f].correct} ok · ${s.fields[f].abstained} left · ${s.fields[f].wrong} wrong`])),
        };
      }),
    );
    for (const model of modelList) {
      if (failedReads[model]) console.log(`\n⚠ ${model}: ${failedReads[model]} of ${keyed} reads failed (a bad key, a rate limit or an outage?). Failed reads count as left to a clinician, so the error counts above are not meaningful until they are zero.`);
      const errors = scored[model].filter((x) => FIELDS.some((f) => x.scores[f] === 'wrong')).sort((a, b) => a.image.localeCompare(b.image));
      if (errors.length) console.log(`\n${model}: confident errors\n` + errors.map((x) => `  ${x.image}: ${FIELDS.filter((f) => x.scores[f] === 'wrong').join(', ')}`).join('\n'));
    }
  }

  const outFile = `proof-model-comparison-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nFull results: ${outFile}`);
}

main();
