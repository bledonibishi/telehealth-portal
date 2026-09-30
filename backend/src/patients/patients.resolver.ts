import { Resolver, Query, Args, ID, Mutation } from '@nestjs/graphql';
import { AuditRead } from '../audit/audit-read.interceptor';
import { ForbiddenException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { PatientModel } from './models/patient.model';
import { PatientListItemModel } from './models/patient-list-item.model';
import { UpdatePatientInput } from './dto/update-patient.input';
import { UpdateBasicInfoInput } from './dto/update-basic-info.input';
import { CreatePatientInput } from './dto/create-patient.input';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { AuthUser, STAFF } from '../auth/access-roles';
import { ClinicianRole, ConsultationKind } from '../common/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Resolver(() => PatientModel)
export class PatientsResolver {
  constructor(private patientsService: PatientsService) {}

  @Authorized(...STAFF)
  @Query(() => [PatientListItemModel])
  patients() {
    return this.patientsService.findAll();
  }

  @Authorized(...STAFF, 'PATIENT')
  @AuditRead('Patient')
  @Query(() => PatientModel, { nullable: true })
  patient(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    // Includes sensitive nested data (onboarding photos, check-in links) —
    // a patient can only ever fetch their own record, not anyone else's.
    if (user.role === 'PATIENT' && user.id !== id) throw new ForbiddenException();
    return this.patientsService.findById(id);
  }

  @Authorized('PATIENT')
  @Query(() => PatientModel, { description: "The authenticated patient's own record" })
  me(@CurrentUser() user: AuthUser) {
    return this.patientsService.findById(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => PatientModel, { description: 'Confirmed date of birth and delivery details, collected once during onboarding' })
  updateMyBasicInfo(@CurrentUser() user: AuthUser, @Args('input') input: UpdateBasicInfoInput) {
    return this.patientsService.updateMyBasicInfo(user.id, input);
  }

  @Authorized('PATIENT')
  @Query(() => ConsultationKind, { nullable: true, description: 'The programme the patient signed up for on the website' })
  async myProductKind(@CurrentUser() user: AuthUser) {
    return this.patientsService.productKindOf(user.id);
  }

  @Authorized(...STAFF)
  @Mutation(() => PatientModel)
  updatePatient(@Args('input') input: UpdatePatientInput) {
    const { id, ...data } = input;
    return this.patientsService.update(id, data);
  }

  @Authorized(ClinicianRole.ADMIN)
  @Mutation(() => PatientModel, { description: 'Fast-track: create a patient with personal info, a plan, and optionally fully-approved onboarding' })
  createPatient(@CurrentUser() user: AuthUser, @Args('input') input: CreatePatientInput) {
    return this.patientsService.createByStaff(user.id, input);
  }
}
