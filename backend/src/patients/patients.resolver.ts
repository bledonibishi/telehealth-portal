import { Resolver, Query, Args, ID, Mutation } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientModel } from './models/patient.model';
import { UpdatePatientInput } from './dto/update-patient.input';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';

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
  patient(@Args('id', { type: () => ID }) id: string) {
    return this.patientsService.findById(id);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => PatientModel)
  updatePatient(@Args('input') input: UpdatePatientInput) {
    const { id, ...data } = input;
    return this.patientsService.update(id, data);
  }
}
