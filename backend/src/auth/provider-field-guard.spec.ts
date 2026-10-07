import { ForbiddenException } from '@nestjs/common';
import { PROVIDER_VISIBLE_FIELDS, providerFieldGuard } from './provider-field-guard';

const run = (user: object | undefined, parentType: string, fieldName: string) => {
  const next = jest.fn().mockResolvedValue('value');
  const ctx = { context: { req: { user } }, info: { parentType: { name: parentType }, fieldName } } as any;
  return { result: providerFieldGuard(ctx, next), next };
};

const provider = { id: 'c1', role: 'CLINICIAN', clinicianRole: 'PROVIDER' };

describe('providerFieldGuard', () => {
  afterEach(() => delete process.env.PHARMACY_SEES_DELIVERY_ADDRESS);

  it('lets the pharmacy partner read what it needs to pack and ship', async () => {
    process.env.PHARMACY_SEES_DELIVERY_ADDRESS = 'true';
    for (const [type, fields] of Object.entries(PROVIDER_VISIBLE_FIELDS)) {
      for (const field of fields) {
        const { result, next } = run(provider, type, field);
        await expect(result).resolves.toBe('value');
        expect(next).toHaveBeenCalled();
      }
    }
  });

  it.each([
    ['Patient', 'dateOfBirth'],
    ['Patient', 'consultations'],
    ['Patient', 'checkIns'],
    ['Patient', 'onboarding'],
    ['Patient', 'messages'],
    ['Prescription', 'patient'],
    ['Prescription', 'prescriber'],
    ['Consultation', 'quizAnswers'],
    ['Consultation', 'redFlags'],
    ['Consultation', 'messages'],
  ])('refuses the pharmacy partner %s.%s', async (type, field) => {
    const { result, next } = run(provider, type, field);
    await expect(result).rejects.toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not touch other kinds of records, which are guarded where they start', async () => {
    const { result } = run(provider, 'Order', 'trackingNumber');
    await expect(result).resolves.toBe('value');
  });

  it.each([
    ['an admin', { id: 'a', role: 'CLINICIAN', clinicianRole: 'ADMIN' }],
    ['a doctor', { id: 'd', role: 'CLINICIAN', clinicianRole: 'DOCTOR' }],
    ['a patient', { id: 'p', role: 'PATIENT' }],
    ['nobody signed in', undefined],
  ])('does not change anything for %s', async (_, user) => {
    for (const [type, field] of [['Patient', 'dateOfBirth'], ['Consultation', 'quizAnswers']]) {
      const { result } = run(user, type, field);
      await expect(result).resolves.toBe('value');
    }
  });
});

describe('providerFieldGuard: where the parcel goes', () => {
  afterEach(() => delete process.env.PHARMACY_SEES_DELIVERY_ADDRESS);
  const asValue = async (user: object | undefined, type: string, field: string) => {
    const { result, next } = run(user, type, field);
    return { result: await result, called: next.mock.calls.length };
  };

  it.each([['Patient', 'addressLine1'], ['Patient', 'phone'], ['DeliveryAddress', 'city'], ['DeliveryAddress', 'phone']])(
    'hides %s.%s from the pharmacy by default',
    async (type, field) => {
      expect(await asValue(provider, type, field)).toEqual({ result: null, called: 0 });
    },
  );

  it('still shows the pharmacy the patient’s name', async () => {
    expect(await asValue(provider, 'Patient', 'firstName')).toEqual({ result: 'value', called: 1 });
  });

  it('shows the address when the clinic turns it on', async () => {
    process.env.PHARMACY_SEES_DELIVERY_ADDRESS = 'true';
    expect(await asValue(provider, 'Patient', 'addressLine1')).toEqual({ result: 'value', called: 1 });
  });

  it('never hides anything from our own staff', async () => {
    expect(await asValue({ id: 'a', role: 'CLINICIAN', clinicianRole: 'ADMIN' }, 'Patient', 'addressLine1')).toEqual({ result: 'value', called: 1 });
  });
});
