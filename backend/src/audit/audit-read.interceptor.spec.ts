import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AuditReadInterceptor } from './audit-read.interceptor';

describe('AuditReadInterceptor', () => {
  const audit = { log: jest.fn() };
  const run = (options: { resourceType: string; idArg: string }, params: Record<string, string>) => {
    const reflector = { get: () => options };
    const context = {
      getHandler: () => function weightTrendForPatient() {},
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ params, user: { id: 'doc-1', role: 'CLINICIAN' } }) }),
    } as unknown as ExecutionContext;
    return lastValueFrom(new AuditReadInterceptor(reflector as any, audit as any).intercept(context, { handle: () => of('result') }));
  };
  beforeEach(() => audit.log.mockReset());

  it('files a read keyed by the patient under that patient, whatever the record is called', async () => {
    await expect(run({ resourceType: 'WeightJourney', idArg: 'patientId' }, { patientId: 'p-1' })).resolves.toBe('result');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'RECORD_VIEWED', resourceType: 'WeightJourney', resourceId: 'p-1', patientId: 'p-1', actorId: 'doc-1' }));
  });

  it('does not guess a patient for a read keyed by something else', async () => {
    await run({ resourceType: 'Consultation', idArg: 'id' }, { id: 'c-1' });
    expect(audit.log.mock.calls[0][0]).not.toHaveProperty('patientId');
  });
});
