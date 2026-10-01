import { ObjectType, Field } from '@nestjs/graphql';
import { ConsentType } from '../common/enums';

@ObjectType('ConsentText')
export class ConsentTextModel {
  @Field(() => ConsentType)
  type: ConsentType;

  @Field()
  version: string;

  @Field({ description: 'One statement per line' })
  text: string;
}
