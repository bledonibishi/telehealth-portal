/**
 * Runs the same prescription-proof photos through several Claude models and
 * prints what each one read, side by side — to pick PROOF_READER_MODEL.
 *
 *   cd backend
 *   pnpm compare-proof-models ./sample-proofs
 *   pnpm compare-proof-models ./sample-proofs claude-opus-5-5 claude-haiku-4-5
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

  const results: Array<Record<string, unknown>> = [];
  for (const image of images) {
    const file = readFileSync(join(dir, image));
    console.log(`\n━━ ${image}`);
    const rows = await Promise.all(
      (models.length ? models : DEFAULT_MODELS).map(async (model) => {
        const env: Record<string, string> = { ANTHROPIC_API_KEY: apiKey, PROOF_READER_MODEL: model };
        const reader = new ProofReaderService({ get: (k: string) => env[k] } as unknown as ConfigService);
        const started = Date.now();
        const out = await reader.read(file, MIME[extname(image).toLowerCase()]);
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        const r = out.status === 'COMPLETED' ? out.reading : null;
        results.push({ image, model, seconds: Number(seconds), ...out });
        return {
          model,
          time: `${seconds}s`,
          status: out.status === 'COMPLETED' ? (r!.readable ? 'read' : 'unreadable') : `${out.status}: ${out.reason}`,
          name: r?.patientName ?? '—',
          medicine: r?.medicineName ?? '—',
          dose: r?.doseMg != null ? `${r.doseMg} mg` : '—',
          date: r?.documentDate ? `${r.documentDate} (${r.dateKind})` : '—',
          concerns: r?.authenticityConcerns.join('; ') || '—',
        };
      }),
    );
    console.table(rows);
  }

  const outFile = `proof-model-comparison-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nFull results: ${outFile}`);
}

main();
