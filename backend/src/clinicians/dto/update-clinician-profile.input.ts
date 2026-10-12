import { Field, ID, InputType } from '@nestjs/graphql';

@InputType()
export class UpdateClinicianProfileInput {
  @Field(() => ID)
  clinicianId: string;

  @Field({ nullable: true, description: 'Leave empty to clear' })
  specialty?: string;

  @Field({ nullable: true, description: 'Leave empty to clear' })
  bio?: string;

  @Field(() => [String], { nullable: true, description: 'Leave empty to clear' })
  languages?: string[];
}
