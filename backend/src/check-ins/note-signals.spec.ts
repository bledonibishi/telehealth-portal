import { RedFlagSeverity } from '../common/enums';
import { detectSignals, noteFlags } from './note-signals';

const signals = (text: string) => detectSignals(text).map((d) => d.signal);

describe('detectSignals', () => {
  it('finds nothing in an ordinary note or an empty one', () => {
    expect(signals('Feeling good, lost 2 kg, no problems this month.')).toEqual([]);
    expect(signals('')).toEqual([]);
    expect(signals(null)).toEqual([]);
  });

  it.each([
    ['I have been really anxious and cant sleep', 'ANXIETY'],
    ['Panic attacks in the evening', 'ANXIETY'],
    ['Jam shume e frikesuar dhe me ankth', 'ANXIETY'],
    ['Ich habe starke Angst und Panik', 'ANXIETY'],
    ['Ich bin überfordert', 'ANXIETY'],
    ['Ich bin ängstlich', 'ANXIETY'],
    ['Ich will aufhören', 'LOW_MOTIVATION'],
    ['Das ist mir zu stark, ich vertrage ich nicht', 'DOSE_DIFFICULTY'],
    ['I have no motivation anymore and want to stop', 'LOW_MOTIVATION'],
    ['Dua të ndalem, nuk ka kuptim', 'LOW_MOTIVATION'],
    ['Ich will aufhören, es ist sinnlos', 'LOW_MOTIVATION'],
    ['The dose is too strong and I struggle every Sunday', 'DOSE_DIFFICULTY'],
    ['Kam frikë nga gjilpera', 'DOSE_DIFFICULTY'],
    ['Die Dosis ist zu stark', 'DOSE_DIFFICULTY'],
    ['I sometimes think about suicide', 'CRISIS'],
    ['Dua të vdes', 'CRISIS'],
    ['Ich will mich umbringen', 'CRISIS'],
  ])('reads “%s” as %s', (text, expected) => {
    expect(signals(text)).toContain(expected);
  });

  it('ignores accents and capitals', () => {
    expect(signals('FRIKË')).toEqual(['ANXIETY']);
    expect(signals('Ängstlich und Angst')).toContain('ANXIETY');
  });

  it('is not fooled by a negation just before the word', () => {
    expect(signals('I am not anxious at all')).toEqual([]);
    expect(signals('No panic, no stress this month')).toEqual([]);
    expect(signals('nuk kam ankth')).toEqual([]);
    expect(signals('keine Angst mehr')).toEqual([]);
  });

  it('never lets a negation hide self-harm language', () => {
    expect(signals("I don't want to live, I might hurt myself")).toContain('CRISIS');
    expect(signals('no, I want to hurt myself')).toContain('CRISIS');
  });

  it('matches whole words, not parts of other words', () => {
    expect(signals('The quitting smoking plan worked')).toEqual([]);
    expect(signals('A worrying amount of paperwork')).toEqual([]);
  });

  it('can raise several signals from one note and lists the words used', () => {
    const found = detectSignals('So anxious and want to stop, the dose is too strong');
    expect(found.map((d) => d.signal).sort()).toEqual(['ANXIETY', 'DOSE_DIFFICULTY', 'LOW_MOTIVATION']);
    expect(found.find((d) => d.signal === 'ANXIETY')!.matched).toContain('anxious');
  });
});

describe('noteFlags', () => {
  it('raises CRITICAL for self-harm language and WARNING for the rest, quoting the words', () => {
    const flags = noteFlags(['I feel hopeless and might hurt myself', 'want to stop']);
    expect(flags.find((f) => f.severity === RedFlagSeverity.CRITICAL)!.description).toMatch(/contact the patient today.*“hurt myself”/);
    expect(flags.find((f) => f.description.startsWith('Note suggests anxiety'))!.severity).toBe(RedFlagSeverity.WARNING);
    expect(flags.find((f) => f.description.startsWith('Note suggests low motivation'))!.description).toContain('“want to stop”');
  });

  it('merges the same signal found in two answers into one flag', () => {
    const flags = noteFlags(['so anxious', 'panic again']);
    expect(flags).toHaveLength(1);
    expect(flags[0].description).toContain('“anxious”');
    expect(flags[0].description).toContain('“panic”');
  });

  it('gives nothing for notes without signals', () => {
    expect(noteFlags(['all good', undefined, null])).toEqual([]);
  });
});
