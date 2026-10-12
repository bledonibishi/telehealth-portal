import { ObjectType, InputType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { DeviceProvider } from '@prisma/client';

registerEnumType(DeviceProvider, { name: 'DeviceProvider' });
export { DeviceProvider };

@InputType()
export class CreateDeviceConnectionInput {
  @Field(() => DeviceProvider)
  provider: DeviceProvider;

  @Field({ description: 'A name to tell it apart, e.g. "Bathroom scale"' })
  label: string;
}

@ObjectType('DeviceConnection')
export class DeviceConnectionModel {
  @Field(() => ID)
  id: string;

  @Field(() => DeviceProvider)
  provider: DeviceProvider;

  @Field()
  label: string;

  @Field({ description: 'The last characters of the token, to tell connections apart' })
  tokenHint: string;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  lastUsedAt?: Date;

  @Field({ nullable: true })
  revokedAt?: Date;
}

@ObjectType('CreatedDeviceConnection')
export class CreatedDeviceConnectionModel extends DeviceConnectionModel {
  @Field({ description: 'The secret the device sends as "Authorization: Bearer <token>". Shown only now — it can’t be read again.' })
  token: string;
}
