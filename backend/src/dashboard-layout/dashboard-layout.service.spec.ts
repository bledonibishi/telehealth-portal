import { DASHBOARD_WIDGETS, activeOverrides, applyOverrides, defaultLayout, normalizeLayout, sizeOf } from '@telehealth/shared-types';
import { DashboardLayoutService } from './dashboard-layout.service';

describe('normalizeLayout', () => {
  it('shows everything in the app’s order when nothing was saved', () => {
    expect(normalizeLayout(null)).toEqual(defaultLayout());
    expect(normalizeLayout(undefined)).toEqual(defaultLayout());
    expect(normalizeLayout('nonsense')).toEqual(defaultLayout());
  });

  it('keeps a reordering and a hidden card', () => {
    const l = normalizeLayout({ main: ['quickLinks', 'plan', 'treatment', 'orders', 'updates'], hidden: ['chat'] });
    expect(l.main).toEqual(['quickLinks', 'plan', 'treatment', 'orders', 'updates']);
    expect(l.hidden).toEqual(['chat']);
    expect(l.side).not.toContain('chat');
  });

  it('lets every card be taken off and put back', () => {
    const everything = DASHBOARD_WIDGETS.map((w) => w.id);
    const hiddenAll = normalizeLayout({ hidden: everything });
    expect(hiddenAll.hidden.sort()).toEqual([...everything].sort());
    expect([...hiddenAll.top, ...hiddenAll.main, ...hiddenAll.side]).toEqual([]);
    const back = normalizeLayout({ ...hiddenAll, hidden: [] });
    expect([...back.top, ...back.main, ...back.side].sort()).toEqual([...everything].sort());
  });

  it('drops cards that do not exist and repeats', () => {
    const l = normalizeLayout({ main: ['plan', 'plan', 'made-up'] });
    expect(l.main.filter((id) => id === 'plan')).toHaveLength(1);
    expect(l.main).not.toContain('made-up');
  });

  it('lets any card sit in any place, wherever the patient put it', () => {
    const l = normalizeLayout({ top: ['chat'], main: ['emergency', 'plan'], side: ['treatment', 'orders'] });
    expect(l.top[0]).toBe('chat');
    expect(l.main.slice(0, 2)).toEqual(['emergency', 'plan']);
    expect(l.side.slice(0, 2)).toEqual(['treatment', 'orders']);
  });

  it('adds a card the patient has never seen to the end of its place', () => {
    const l = normalizeLayout({ main: ['plan'], side: [], top: [], hidden: [] });
    expect(l.main[0]).toBe('plan');
    expect(l.main).toEqual(expect.arrayContaining(['treatment', 'updates', 'orders', 'quickLinks']));
    expect(l.side).toEqual(expect.arrayContaining(['profile', 'chat', 'appointment', 'emergency', 'contact']));
    expect(l.top).toEqual(['progress']);
  });

  it('puts every card in exactly one place, shown or hidden', () => {
    const l = normalizeLayout({ hidden: ['chat', 'contact', 'orders'], main: ['quickLinks'] });
    const all = [...l.top, ...l.main, ...l.side, ...l.hidden].sort();
    expect(all).toEqual(DASHBOARD_WIDGETS.map((w) => w.id).sort());
  });
});

describe('card sizes', () => {
  it('keeps a size for a card that can be resized, to a size it offers', () => {
    const l = normalizeLayout({ sizes: { updates: 'large', orders: 'medium' } });
    expect(l.sizes).toEqual({ updates: 'large', orders: 'medium' });
    expect(sizeOf(l, 'updates')).toBe('large');
  });

  it('ignores a size that does not exist and a card that does not exist', () => {
    const l = normalizeLayout({ sizes: { plan: 'small', updates: 'huge', 'made-up': 'small', emergency: 'large' } });
    expect(l.sizes).toEqual({ plan: 'small', emergency: 'large' }); // every card can be any size; the others are ignored
    expect(sizeOf(l, 'plan')).toBe('small');
  });

  it('shows a card at its own size until the patient changes it', () => {
    expect(sizeOf(defaultLayout(), 'updates')).toBe('small');
    expect(sizeOf(defaultLayout(), 'chat')).toBe('small');
    expect(sizeOf(defaultLayout(), 'plan')).toBe('large');
    expect(sizeOf(defaultLayout(), 'profile')).toBe('small');
  });
});

describe('DashboardLayoutService', () => {
  const build = (stored: unknown = null, overrides: unknown = null) => {
    const prisma: any = { patient: { findUnique: jest.fn().mockResolvedValue({ dashboardLayout: stored, dashboardOverrides: overrides }), update: jest.fn().mockResolvedValue({}) } };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    return { prisma, audit, service: new DashboardLayoutService(prisma, audit as any) };
  };

  it('returns the default for a patient who has not changed anything', async () => {
    expect(await build(null).service.get('p-1')).toEqual(defaultLayout());
  });

  it('returns what they saved, made valid', async () => {
    const l = await build({ hidden: ['chat', 'made-up', 'chat'] }).service.get('p-1');
    expect(l.hidden).toEqual(['chat']);
  });

  it('saves the layout, made valid, exactly as stored', async () => {
    const { service, prisma } = build();
    const saved = await service.save('p-1', { hidden: ['emergency', 'contact', 'made-up'], sizes: { orders: 'large' } });
    expect(saved.hidden).toEqual(['emergency', 'contact']);
    expect(prisma.patient.update.mock.calls[0][0].data.dashboardLayout.hidden).toEqual(['emergency', 'contact']);
    expect(prisma.patient.update.mock.calls[0][0].data.dashboardLayout.sizes).toEqual({ orders: 'large' });
  });

  it('resets to the default', async () => {
    const { service, prisma } = build({ hidden: ['chat'] });
    expect(await service.reset('p-1')).toEqual(defaultLayout());
    expect(prisma.patient.update).toHaveBeenCalled();
  });
});

const cx = { id: 'cx-1', email: 'cx@x.com', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' } as any;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const hold = (over: any = {}) => ({ id: 'chat', mode: 'HIDE', until: inDays(3), reason: 'Patient asked', byId: 'cx-1', at: new Date().toISOString(), ...over });

const build = (stored: unknown = null, overrides: unknown = null) => {
  const prisma: any = { patient: { findUnique: jest.fn().mockResolvedValue({ dashboardLayout: stored, dashboardOverrides: overrides }), update: jest.fn().mockResolvedValue({}) } };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  return { prisma, audit, service: new DashboardLayoutService(prisma, audit as any) };
};

describe('support holds on a patient’s dashboard', () => {
  it('only counts the holds still in force, for cards that exist', () => {
    const live = activeOverrides([hold(), hold({ id: 'orders', until: inDays(-1) }), hold({ id: 'made-up' }), 'nonsense', null]);
    expect(live.map((o) => o.id)).toEqual(['chat']);
    expect(activeOverrides(undefined)).toEqual([]);
  });

  it('takes a hidden card out of the patient’s screen and out of the “add” list, and says it is support’s doing', () => {
    const l = applyOverrides(defaultLayout(), [hold()] as any);
    expect([...l.top, ...l.main, ...l.side]).not.toContain('chat');
    expect(l.hidden).not.toContain('chat');
    expect(l.staffHidden).toEqual([{ id: 'chat', until: expect.any(String) }]);
  });

  it('brings back a card the patient had removed, when support shows it', () => {
    const base = normalizeLayout({ hidden: ['updates'] });
    const l = applyOverrides(base, [hold({ id: 'updates', mode: 'SHOW' })] as any);
    expect(l.hidden).not.toContain('updates');
    expect(l.main).toContain('updates');
  });

  it('never hides a treatment or emergency card, even if a hold says so', () => {
    const l = applyOverrides(defaultLayout(), [hold({ id: 'emergency' }), hold({ id: 'plan' })] as any);
    expect(l.side).toContain('emergency');
    expect(l.main).toContain('plan');
    expect(l.staffHidden).toEqual([]);
  });

  it('shows the patient the layout with holds applied, and leaves their own saved arrangement alone', async () => {
    const { service } = build({ hidden: ['orders'] }, [hold()]);
    const shown = await service.getForPatient('p-1');
    expect(shown.staffHidden.map((h) => h.id)).toEqual(['chat']);
    expect(shown.hidden).toEqual(['orders']);
    expect((await service.get('p-1')).hidden).toEqual(['orders']);
  });

  it('support hides a card for a number of days, with a reason, and it is audited', async () => {
    const { service, prisma, audit } = build();
    const cards = await service.setHold(cx, 'p-1', { cardId: 'chat', action: 'HIDE', days: 7, reason: 'Patient asked for a simpler screen' });
    const saved = prisma.patient.update.mock.calls[0][0].data.dashboardOverrides;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'chat', mode: 'HIDE', byId: 'cx-1', reason: 'Patient asked for a simpler screen' });
    expect(new Date(saved[0].until).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DASHBOARD_CARD_HIDE', patientId: 'p-1', metadata: expect.objectContaining({ card: 'chat', days: 7 }) }));
    expect(cards.find((c) => c.id === 'chat')).toBeDefined();
  });

  it('refuses to hide treatment or emergency cards, and a hold without a reason or with a bad length', async () => {
    const { service, prisma } = build();
    await expect(service.setHold(cx, 'p-1', { cardId: 'emergency', action: 'HIDE', days: 3, reason: 'Because' })).rejects.toThrow(/safety/i);
    await expect(service.setHold(cx, 'p-1', { cardId: 'chat', action: 'HIDE', days: 3, reason: 'no' })).rejects.toThrow(/why/i);
    await expect(service.setHold(cx, 'p-1', { cardId: 'chat', action: 'HIDE', days: 90, reason: 'A long one' })).rejects.toThrow(/1 to 30/);
    await expect(service.setHold(cx, 'p-1', { cardId: 'made-up', action: 'HIDE', days: 3, reason: 'Because' })).rejects.toThrow(/doesn’t exist/);
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('lifts a hold without needing a reason, and keeps the others', async () => {
    const { service, prisma } = build(null, [hold({ id: 'chat' }), hold({ id: 'orders' })]);
    await service.setHold(cx, 'p-1', { cardId: 'chat', action: 'CLEAR' });
    expect(prisma.patient.update.mock.calls[0][0].data.dashboardOverrides.map((o: any) => o.id)).toEqual(['orders']);
  });

  it('tells support whether each card is showing, hidden by the patient, or held by support', async () => {
    const { service } = build({ hidden: ['orders'] }, [hold()]);
    const cards = await service.cardsFor('p-1');
    expect(cards.find((c) => c.id === 'chat')).toMatchObject({ state: 'HIDDEN_BY_SUPPORT', canHide: true });
    expect(cards.find((c) => c.id === 'orders')?.state).toBe('HIDDEN_BY_PATIENT');
    expect(cards.find((c) => c.id === 'updates')?.state).toBe('SHOWING');
    expect(cards.find((c) => c.id === 'emergency')?.canHide).toBe(false);
  });
});
