/**
 * Tests the urgency check (src/ai/message-urgency.service.ts) against made-up patient messages (src/ai/urgency-eval-cases.ts),
 * with the real AI service and the same instructions it uses live.
 *
 *   cd backend
 *   pnpm urgency-eval                    # every message, 5 times each
 *   pnpm urgency-eval albanian           # only the cases whose name contains "albanian"
 *   pnpm urgency-eval --runs 1           # once each, for a quick look
 *   pnpm urgency-eval --out before.json  # also save the results, to compare with a run after a change
 *
 * Two numbers matter. Urgent messages caught: every urgent message must be marked on every run, or this version is not
 * used (a miss is what can hurt a patient). False alarms: routine messages marked urgent; some are acceptable, a lot means
 * clinicians stop trusting the mark.
 *
 * Run it before changing the instructions or the model (AI_MODEL_URGENCY), and after. It sends only these made-up messages
 * to the AI service named in backend/.env (a full run is about 150 short calls, well under a dollar). Needs
 * ANTHROPIC_API_KEY, and "urgency" in AI_ENABLED_FEATURES.
 */
import { AiAssistService } from '../src/ai/ai-assist.service';
import { MessageUrgencyService } from '../src/ai/message-urgency.service';
import { URGENCY_CASES } from '../src/ai/urgency-eval-cases';
import { evalArgs, loadBackendEnv, pool, saveResults, requireCases } from './eval-utils';

/** Above this share of routine messages marked urgent, the run is flagged: clinicians would start ignoring the mark. */
const MAX_FALSE_ALARMS = 0.1;

async function main() {
  const { runs, out, match } = evalArgs();
  loadBackendEnv();
  const ai = new AiAssistService({ get: (key: string) => process.env[key] } as any);
  if (!ai.isEnabled('urgency')) {
    console.error('The urgency check is off here. Set ANTHROPIC_API_KEY and add "urgency" to AI_ENABLED_FEATURES in backend/.env.');
    process.exit(1);
  }
  // Only assess() is used, which needs nothing but the AI service.
  const check = new MessageUrgencyService(null as any, ai);
  const cases = URGENCY_CASES.filter((c) => match(c.name));
  requireCases(cases.length);
  console.log(`Urgency check: ${ai.modelFor('urgency')}. ${cases.length} messages, ${runs} run(s) each.\n`);

  const results = [];
  for (const c of cases) {
    const all = await pool(Array.from({ length: runs }, () => () => check.assess(c.message)));
    // A check that could not run counts as a miss for an urgent message: live, nothing would have been marked.
    const marked = all.filter((r) => r.status === 'COMPLETED' && r.data.urgent === true).length;
    const failed = all.filter((r) => r.status !== 'COMPLETED').length;
    const right = c.urgent ? marked : runs - marked - failed;
    const missed = c.urgent && right < runs;
    results.push({ name: c.name, urgent: c.urgent, runs, right, failed });
    const mark = missed ? '⛔' : right === runs ? '✓' : '✗';
    const what = c.urgent ? `marked urgent ${marked}/${runs}` : `left alone ${right}/${runs}`;
    console.log(`${mark} ${c.urgent ? '[urgent] ' : '[routine]'} ${c.name} (${what}${failed ? `, ${failed} could not be checked` : ''})`);
  }

  const urgent = results.filter((r) => r.urgent);
  const routine = results.filter((r) => !r.urgent);
  const caught = urgent.reduce((n, r) => n + r.right, 0);
  const urgentRuns = urgent.reduce((n, r) => n + r.runs, 0);
  const alarms = routine.reduce((n, r) => n + (r.runs - r.right - r.failed), 0);
  const routineRuns = routine.reduce((n, r) => n + r.runs, 0);
  const missedCases = urgent.filter((r) => r.right < r.runs);
  const alarmRate = routineRuns ? alarms / routineRuns : 0;

  console.log(`\nUrgent messages caught: ${caught} of ${urgentRuns} (${urgentRuns ? Math.round((caught / urgentRuns) * 100) : 100}%).`);
  console.log(`False alarms: ${alarms} of ${routineRuns} routine messages (${Math.round(alarmRate * 100)}%).`);
  if (missedCases.length) console.log(`⛔ Missed at least once: ${missedCases.map((r) => r.name).join('; ')}. Do not use this version with patients.`);
  else if (alarmRate > MAX_FALSE_ALARMS) console.log(`More than ${MAX_FALSE_ALARMS * 100}% false alarms: clinicians would learn to ignore the mark. Worth a look.`);
  else console.log('Every urgent message was caught on every run.');

  saveResults(out, { model: ai.modelFor('urgency'), runs, caught, urgentRuns, alarms, routineRuns, results });
  process.exit(missedCases.length || alarmRate > MAX_FALSE_ALARMS ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
