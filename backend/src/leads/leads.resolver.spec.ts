import { LeadsResolver } from './leads.resolver';

const resolver = new LeadsResolver({} as any);
const lead = (over: object = {}) => ({ quizAnswers: [], intakeSavedAt: null, checkoutDetails: null, convertedAt: null, ...over }) as any;

describe('LeadsResolver — how far a lead got', () => {
  it('reads the stage from what has been saved so far', () => {
    expect(resolver.stage(lead())).toBe('QUIZ');
    expect(resolver.stage(lead({ intakeSavedAt: new Date() }))).toBe('HEALTH_ANSWERED');
    expect(resolver.stage(lead({ intakeSavedAt: new Date(), checkoutDetails: { city: 'Prishtinë' } }))).toBe('AT_CHECKOUT');
    expect(resolver.stage(lead({ checkoutDetails: { city: 'Prishtinë' }, convertedAt: new Date() }))).toBe('PAID');
  });

  it('treats empty delivery details as not reached', () => {
    expect(resolver.stage(lead({ intakeSavedAt: new Date(), checkoutDetails: {} }))).toBe('HEALTH_ANSWERED');
  });

  it('shows the treatment chosen at checkout over the one picked earlier on the products page', () => {
    const answers = [
      { questionId: 'preferred_medication', answer: 'Wegovy' },
      { questionId: 'preferred_treatment', answer: 'Mounjaro 5 mg' },
    ];
    expect(resolver.treatment(lead({ quizAnswers: answers }))).toBe('Mounjaro 5 mg');
    expect(resolver.treatment(lead({ quizAnswers: answers.slice(0, 1) }))).toBe('Wegovy');
    expect(resolver.treatment(lead())).toBeNull();
  });
});
