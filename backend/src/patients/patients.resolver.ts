import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientModel } from './models/patient.model';
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
}
