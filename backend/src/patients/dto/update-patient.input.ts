import { InputType, Field, ID } from '@nestjs/graphql';

@InputType()
export class UpdatePatientInput {
  @Field(() => ID)
  id: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  dateOfBirth?: Date;
}
