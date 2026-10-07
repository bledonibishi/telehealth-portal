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
import { AuthUser, CLINICAL_STAFF } from '../auth/access-roles';
import { ClinicianRole, ConsultationKind } from '../common/enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PatientProfileService } from './patient-profile.service';
import { PatientProfileModel, UpdateMyProfileInput } from './models/patient-profile.model';

@Resolver(() => PatientModel)
export class PatientsResolver {
  constructor(
    private patientsService: PatientsService,
    private profile: PatientProfileService,
  ) {}

  @Authorized('PATIENT')
  @Query(() => PatientProfileModel, { description: 'The signed-in patient’s profile: contact and body details' })
  myProfile(@CurrentUser() user: AuthUser) {
    return this.profile.mine(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => PatientProfileModel, { description: 'Update gender, height or phone. Audited.' })
  updateMyProfile(@CurrentUser() user: AuthUser, @Args('input') input: UpdateMyProfileInput) {
    return this.profile.update(user.id, input);
  }

  @Authorized(...CLINICAL_STAFF)
  @Query(() => [PatientListItemModel])
  patients() {
    return this.patientsService.findAll();
  }

  @Authorized(...CLINICAL_STAFF, 'PATIENT')
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

  @Authorized(...CLINICAL_STAFF)
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
