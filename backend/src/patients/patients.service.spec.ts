import { PatientsService } from './patients.service';

describe('PatientsService.findAll', () => {
  const row = (over: Partial<any> = {}) => ({
    id: 'p-1',
    firstName: 'Emma',
    lead: { productKind: 'HRT' },
    consultations: [{ status: 'APPROVED' }],
    prescriptions: [{ id: 'rx-1' }],
    checkIns: [{ status: 'SENT', dueAt: new Date('2026-10-01') }],
    ...over,
  });

  it('flattens the lead, latest consultation, active prescription and latest check-in onto the patient', async () => {
    const prisma = { patient: { findMany: jest.fn().mockResolvedValue([row()]) } };
    const [result] = await new PatientsService(prisma as any).findAll();

    expect(result).toMatchObject({
      id: 'p-1',
      firstName: 'Emma',
      productKind: 'HRT',
      latestConsultationStatus: 'APPROVED',
      hasActivePrescription: true,
      lastCheckInStatus: 'SENT',
      lastCheckInDueAt: new Date('2026-10-01'),
    });
    expect(result).not.toHaveProperty('lead');
    expect(result).not.toHaveProperty('consultations');
    expect(result).not.toHaveProperty('prescriptions');
    expect(result).not.toHaveProperty('checkIns');
  });

  it('only counts active prescriptions', async () => {
    const prisma = { patient: { findMany: jest.fn().mockResolvedValue([row({ prescriptions: [] })]) } };
    const [result] = await new PatientsService(prisma as any).findAll();
    expect(result.hasActivePrescription).toBe(false);
  });

  it('defaults everything to null for a patient with no lead, consultations or check-ins', async () => {
    const prisma = {
      patient: {
        findMany: jest.fn().mockResolvedValue([row({ lead: null, consultations: [], checkIns: [], prescriptions: [] })]),
      },
    };
    const [result] = await new PatientsService(prisma as any).findAll();

    expect(result).toMatchObject({
      productKind: null,
      latestConsultationStatus: null,
      hasActivePrescription: false,
      lastCheckInStatus: null,
      lastCheckInDueAt: null,
    });
  });

  it('queries the latest consultation and check-in only (take 1, newest first) and only active prescriptions', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await new PatientsService({ patient: { findMany } } as any).findAll();

    const { include } = findMany.mock.calls[0][0];
    expect(include.consultations).toMatchObject({ take: 1, orderBy: { submittedAt: 'desc' } });
    expect(include.checkIns).toMatchObject({ take: 1, orderBy: { createdAt: 'desc' } });
    expect(include.prescriptions).toMatchObject({ where: { status: 'ACTIVE' } });
  });
});

describe('PatientsService.updateMyBasicInfo', () => {
  const validInput = {
    firstName: ' Emma ',
    lastName: ' White ',
    dateOfBirth: new Date('1990-05-01'),
    phone: ' +383 44 000 000 ',
    addressLine1: ' Rr. A 1 ',
    addressLine2: '',
    city: ' Prishtinë ',
    postcode: ' 10000 ',
    country: ' Kosovo ',
  };

  const service = (update = jest.fn()) => [new PatientsService({ patient: { update } } as any), update] as const;

  it('trims and saves name, date of birth and address, dropping a blank address line 2', async () => {
    const [svc, update] = service();
    await svc.updateMyBasicInfo('p-1', validInput as any);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: {
        firstName: 'Emma',
        lastName: 'White',
        dateOfBirth: validInput.dateOfBirth,
        phone: '+383 44 000 000',
        addressLine1: 'Rr. A 1',
        addressLine2: null,
        city: 'Prishtinë',
        postcode: '10000',
        country: 'Kosovo',
      },
    });
  });

  it('rejects a blank name', async () => {
    const [svc, update] = service();
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, firstName: '  ' } as any)).rejects.toThrow(/first and last name/);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a date of birth in the future', async () => {
    const [svc] = service();
    const future = new Date(Date.now() + 86_400_000);
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, dateOfBirth: future } as any)).rejects.toThrow(/valid date of birth/);
  });

  it('rejects an unparseable date of birth', async () => {
    const [svc] = service();
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, dateOfBirth: 'not-a-date' } as any)).rejects.toThrow(/valid date of birth/);
  });

  it('rejects someone under 18', async () => {
    const [svc] = service();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, dateOfBirth: tenYearsAgo } as any)).rejects.toThrow(/at least 18/);
  });

  it('rejects a missing delivery address field', async () => {
    const [svc, update] = service();
    await expect(svc.updateMyBasicInfo('p-1', { ...validInput, city: '' } as any)).rejects.toThrow(/phone number and full delivery address/);
    expect(update).not.toHaveBeenCalled();
  });
});
