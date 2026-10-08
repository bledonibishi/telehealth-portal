import { PushService } from './push.service';

const TOKEN = 'ExponentPushToken[abc-123_X]';

function setup(devices: Array<{ token: string }> = [{ token: TOKEN }]) {
  const prisma: any = {
    pushDevice: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue(devices),
    },
  };
  return { service: new PushService(prisma), prisma };
}

describe('PushService', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('registers a phone, moving it to the patient who signed in last', async () => {
    const { service, prisma } = setup();
    await service.register('p-2', TOKEN, 'ios');
    expect(prisma.pushDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { token: TOKEN }, update: expect.objectContaining({ patientId: 'p-2' }) }));
  });

  it.each([['not a token', 'ios'], [TOKEN, 'windows']])('refuses %s on %s', async (token, platform) => {
    const { service, prisma } = setup();
    await expect(service.register('p-1', token, platform)).rejects.toThrow();
    expect(prisma.pushDevice.upsert).not.toHaveBeenCalled();
  });

  it('only removes the caller’s own registration', async () => {
    const { service, prisma } = setup();
    await service.unregister('p-1', TOKEN);
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { patientId: 'p-1', token: TOKEN } });
  });

  it('sends one message per phone', async () => {
    const { service } = setup([{ token: TOKEN }, { token: 'ExponentPushToken[second]' }]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) }) as any;
    await service.sendToPatient('p-1', { title: 'T', body: 'B', data: { type: 'order' } });
    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sent.map((m: any) => m.to)).toEqual([TOKEN, 'ExponentPushToken[second]']);
    expect(sent[0]).toMatchObject({ title: 'T', body: 'B', data: { type: 'order' } });
  });

  it('does nothing for a patient with no phone registered', async () => {
    const { service } = setup([]);
    global.fetch = jest.fn() as any;
    await service.sendToPatient('p-1', { title: 'T', body: 'B' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('forgets a phone that has uninstalled the app', async () => {
    const { service, prisma } = setup([{ token: TOKEN }, { token: 'ExponentPushToken[ok]' }]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok' }] }) }) as any;
    await service.sendToPatient('p-1', { title: 'T', body: 'B' });
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { token: { in: [TOKEN] } } });
  });

  it('never throws when Expo is down', async () => {
    const { service } = setup();
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    await expect(service.sendToPatient('p-1', { title: 'T', body: 'B' })).resolves.toBeUndefined();
  });
});
