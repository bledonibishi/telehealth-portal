/**
 * Tests the automated support assistant against a fixed set of questions (src/support-bot/eval-cases.ts), the way it will meet
 * them: it asks the real AI service, with the same instructions and help articles, and checks the answer.
 *
 *   cd backend
 *   pnpm support-bot-eval            # all cases
 *   pnpm support-bot-eval forgot     # only the cases whose name contains "forgot"
 *
 * Run it before changing the assistant's instructions, an article or the model, and after. It sends only these made-up
 * questions (no patient data) to the AI service named in backend/.env, which costs a few cents, so it is run by a person and
 * is not part of the test suite. Needs ANTHROPIC_API_KEY, and "support" in AI_ENABLED_FEATURES.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { AiAssistService } from '../src/ai/ai-assist.service';
import { SupportBotService } from '../src/support-bot/support-bot.service';
import { DEFAULT_ARTICLES } from '../src/support-bot/support-knowledge';
import { answerProblems, EVAL_CASES } from '../src/support-bot/eval-cases';

async function main() {
  const envFile = resolve(__dirname, '../.env');
  if (existsSync(envFile)) (process as unknown as { loadEnvFile(path: string): void }).loadEnvFile(envFile);
  const ai = new AiAssistService({ get: (key: string) => process.env[key] } as any);
  if (!ai.isEnabled('support')) {
    console.error('The support assistant is off here. Set ANTHROPIC_API_KEY and add "support" to AI_ENABLED_FEATURES in backend/.env.');
    process.exit(1);
  }
  // Only interpret() is used, which needs nothing but the AI service.
  const bot = new SupportBotService(null as any, ai, null as any, null as any);
  const filter = process.argv[2]?.toLowerCase();
  const cases = EVAL_CASES.filter((c) => !filter || c.name.toLowerCase().includes(filter));

  let failed = 0;
  for (const c of cases) {
    const result = await bot.interpret({ articles: DEFAULT_ARTICLES, transcript: c.transcript, attempts: c.attempts ?? 0, awaiting: !!c.awaiting });
    const problems: string[] = [];
    if (result.status !== 'COMPLETED') {
      problems.push(`no answer from the AI service (${result.reason})`);
    } else {
      const d = result.data;
      if (!c.expect.intent.includes(d.intent)) problems.push(`understood it as ${d.intent}, expected ${c.expect.intent.join(' or ')}`);
      if (c.expect.article !== undefined && (d.articleId ?? null) !== c.expect.article) problems.push(`used article ${d.articleId ?? 'none'}, expected ${c.expect.article ?? 'none'}`);
      if (c.expect.language && d.language !== c.expect.language) problems.push(`language ${d.language}, expected ${c.expect.language}`);
      if (d.answer) for (const p of answerProblems(d.answer)) problems.push(`the answer ${p}: “${d.answer.slice(0, 120)}…”`);
      // A health question must never come back with an answer at all.
      if (d.intent === 'MEDICAL' && d.answer.trim()) problems.push('answered a health question');
    }
    if (problems.length) failed += 1;
    console.log(`${problems.length ? '✗' : '✓'} ${c.name}${problems.length ? `\n    ${problems.join('\n    ')}` : ''}`);
  }
  console.log(`\n${cases.length - failed} of ${cases.length} passed.${failed ? ` ${failed} need a look before this assistant is used with patients.` : ''}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
