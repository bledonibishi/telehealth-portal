import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const build = (clinician: any) => {
    const prisma = { clinician: { findUnique: jest.fn().mockResolvedValue(clinician) }, patient: { findUnique: jest.fn() } };
    return new JwtStrategy({ get: () => 'secret' } as any, prisma as any);
  };
  const doctor = { id: 'c-1', email: 'd@clinic.dev', role: 'DOCTOR', deactivatedAt: null };

  it('lets an active clinician through with the role the database has now, not the one in the token', async () => {
    const user = await build({ ...doctor, role: 'ADMIN' }).validate({ sub: 'c-1', role: 'DOCTOR' });
    expect(user).toMatchObject({ id: 'c-1', clinicianRole: 'ADMIN' });
  });

  it('stops a deactivated clinician on a session that is already open', async () => {
    await expect(build({ ...doctor, deactivatedAt: new Date() }).validate({ sub: 'c-1', role: 'DOCTOR' })).rejects.toMatchObject({
      response: expect.objectContaining({ reason: 'ACCOUNT_DEACTIVATED' }),
    });
  });

  it('refuses a clinician who no longer exists', async () => {
    await expect(build(null).validate({ sub: 'gone', role: 'DOCTOR' })).rejects.toMatchObject({ response: expect.objectContaining({ reason: 'ACCOUNT_NOT_FOUND' }) });
  });
});
