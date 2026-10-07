import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/access-roles';
import { BodyMeasurementsService } from './body-measurements.service';
import { BodyMeasurementModel } from './models/body-measurement.model';
import { AddBodyMeasurementInput } from './dto/body-measurement.input';

@Resolver()
export class BodyMeasurementsResolver {
  constructor(private measurements: BodyMeasurementsService) {}

  // A patient can only ever act on their own data: the id always comes from the token, never an argument.
  @Authorized('PATIENT')
  @Query(() => [BodyMeasurementModel], { description: 'The signed-in patient’s waist, hip and arm measurements, newest first' })
  myBodyMeasurements(@CurrentUser() user: AuthUser) {
    return this.measurements.list(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => [BodyMeasurementModel], { description: 'Record waist, hips and/or arm. Returns the updated list.' })
  addMyBodyMeasurement(@CurrentUser() user: AuthUser, @Args('input') input: AddBodyMeasurementInput) {
    return this.measurements.add(user.id, input);
  }

  @Authorized('PATIENT')
  @Mutation(() => [BodyMeasurementModel], { description: 'Remove one of your own mistaken entries (kept on record as voided)' })
  voidMyBodyMeasurement(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.measurements.voidOwn(user.id, id);
  }
}
