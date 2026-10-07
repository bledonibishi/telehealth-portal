import { ForbiddenException } from '@nestjs/common';
import { PrescriptionDocumentController } from './prescription-document.controller';

function setup(hasLiveOrder: boolean) {
  const documents = {
    load: jest.fn().mockResolvedValue({ id: 'rx-1', patientId: 'p-1' }),
    render: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    hasLiveOrder: jest.fn().mockResolvedValue(hasLiveOrder),
  };
  const audit = { log: jest.fn() };
  const controller = new PrescriptionDocumentController(documents as any, audit as any);
  const res = { setHeader: jest.fn() } as any;
  return { controller, documents, audit, res };
}

const asRole = (role: string, id = 'u-1') => ({ user: role === 'PATIENT' ? { id, role: 'PATIENT' } : { id, role: 'CLINICIAN', clinicianRole: role } }) as any;

describe('PrescriptionDocumentController — who may open a prescription', () => {
  it('lets the pharmacy partner open one that has an order waiting', async () => {
    const { controller, res, audit } = setup(true);
    await expect(controller.document(asRole('PROVIDER'), 'rx-1', res)).resolves.toBeDefined();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PRESCRIPTION_DOCUMENT_VIEWED', patientId: 'p-1' }));
  });

  it('refuses the pharmacy partner a prescription with no live order, before anything is rendered or logged as viewed', async () => {
    const { controller, res, documents, audit } = setup(false);
    await expect(controller.document(asRole('PROVIDER'), 'rx-1', res)).rejects.toThrow(ForbiddenException);
    expect(documents.render).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('does not apply that rule to doctors, who prescribed it, or to the patient who owns it', async () => {
    const { controller, res, documents } = setup(false);
    await expect(controller.document(asRole('DOCTOR'), 'rx-1', res)).resolves.toBeDefined();
    await expect(controller.document(asRole('PATIENT', 'p-1'), 'rx-1', res)).resolves.toBeDefined();
    expect(documents.hasLiveOrder).not.toHaveBeenCalled();
  });

  it('still keeps another patient out', async () => {
    const { controller, res } = setup(true);
    await expect(controller.document(asRole('PATIENT', 'someone-else'), 'rx-1', res)).rejects.toThrow(ForbiddenException);
  });
});
