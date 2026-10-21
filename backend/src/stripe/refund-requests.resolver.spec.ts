import 'reflect-metadata';
import { ROLES_KEY } from '../auth/access-roles';
import { ClinicianRole } from '../common/enums';
import { RefundRequestsResolver } from './refund-requests.resolver';

it('restricts refund consultation repair to admins and passes their identity to the service', async () => {
  const retryConsultationClosure = jest.fn().mockResolvedValue(1);
  const resolver = new RefundRequestsResolver({ retryConsultationClosure } as any);
  expect(Reflect.getMetadata(ROLES_KEY, resolver.retryRefundConsultationClosure)).toEqual([ClinicianRole.ADMIN]);
  expect(await resolver.retryRefundConsultationClosure({ id: 'admin' } as any, 'r-1')).toBe(1);
  expect(retryConsultationClosure).toHaveBeenCalledWith('admin', 'r-1');
});
