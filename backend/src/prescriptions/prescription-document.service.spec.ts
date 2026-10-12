import { PrescriptionDocumentService } from './prescription-document.service';

describe('PrescriptionDocumentService.hasLiveOrder', () => {
  const build = () => {
    const prisma: any = { order: { count: jest.fn().mockResolvedValue(1) } };
    return { prisma, service: new PrescriptionDocumentService(prisma, {} as any) };
  };

  it('counts only orders still with the pharmacy or on their way, not delivered or cancelled ones', async () => {
    const { prisma, service } = build();
    await service.hasLiveOrder('rx-1');
    expect(prisma.order.count).toHaveBeenCalledWith({ where: { prescriptionId: 'rx-1', status: { in: ['PENDING', 'DISPATCHED', 'OUT_FOR_DELIVERY'] } } });
  });
});
