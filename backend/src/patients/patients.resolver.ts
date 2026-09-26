import { Resolver, Query, Args, ID, Mutation } from '@nestjs/graphql';
import { UseGuards, ForbiddenException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientModel } from './models/patient.model';
import { UpdatePatientInput } from './dto/update-patient.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => PatientModel)
export class PatientsResolver {
  constructor(private patientsService: PatientsService) {}

  @UseGuards(GqlAuthGuard)
  @Query(() => [PatientModel])
  patients() {
    return this.patientsService.findAll();
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => PatientModel, { nullable: true })
  patient(@CurrentUser() user: { id: string; role: string }, @Args('id', { type: () => ID }) id: string) {
    // Includes sensitive nested data (onboarding photos, check-in links) —
    // a patient can only ever fetch their own record, not anyone else's.
    if (user.role === 'PATIENT' && user.id !== id) throw new ForbiddenException();
    return this.patientsService.findById(id);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => PatientModel)
  updatePatient(@Args('input') input: UpdatePatientInput) {
    const { id, ...data } = input;
    return this.patientsService.update(id, data);
  }
}
