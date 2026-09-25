import { ObjectType, Field, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class DashboardMetrics {
  @Field(() => Int)
  totalLeads: number;

  @Field(() => Int)
  leadsThisWeek: number;

  @Field(() => Int)
  totalPatients: number;

  @Field(() => Int)
  activePatients: number;

  @Field(() => Float)
  conversionRate: number;

  @Field(() => Int)
  pendingConsultations: number;

  @Field(() => Int)
  approvedConsultations: number;

  @Field(() => Int)
  pendingOrders: number;

  @Field(() => Int)
  dispatchedOrders: number;

  @Field(() => Int)
  newLeadsToday: number;

  @Field(() => Int)
  newPatientsThisWeek: number;
}
