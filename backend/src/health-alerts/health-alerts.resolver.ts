import { Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { PRESCRIBERS } from '../auth/access-roles';
import { HealthAlertModel } from './health-alerts.model';
import { HealthAlertsService } from './health-alerts.service';

@Resolver()
export class HealthAlertsResolver {
  constructor(private alerts: HealthAlertsService) {}

  // Clinical: doctors only, not support or fulfilment staff.
  @Authorized(...PRESCRIBERS)
  @Query(() => [HealthAlertModel], { description: 'What a doctor should look at first, most urgent first: a rising weight, severe side effects, consultations waiting, overdue check-ins, prescriptions about to end' })
  healthAlerts() {
    return this.alerts.alerts() as unknown as Promise<HealthAlertModel[]>;
  }
}
