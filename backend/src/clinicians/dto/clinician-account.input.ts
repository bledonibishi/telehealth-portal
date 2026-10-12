import { Field, ID, InputType } from '@nestjs/graphql';
import { ClinicianRole } from '../../common/enums';

@InputType()
export class CreateClinicianInput {
  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  email: string;

  @Field(() => ClinicianRole)
  role: ClinicianRole;
}

@InputType()
export class UpdateClinicianInput {
  @Field(() => ID)
  clinicianId: string;

  @Field({ nullable: true, description: 'Leave out to keep it' })
  firstName?: string;

  @Field({ nullable: true, description: 'Leave out to keep it' })
  lastName?: string;

  @Field({ nullable: true, description: 'Leave out to keep it. Must not belong to another account.' })
  email?: string;
}
