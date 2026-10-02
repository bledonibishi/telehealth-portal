import { ObjectType, Field, Int, registerEnumType } from '@nestjs/graphql';

export enum PartnerTransmissionStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}
registerEnumType(PartnerTransmissionStatus, { name: 'PartnerTransmissionStatus' });

@ObjectType('PartnerTransmission')
export class PartnerTransmissionModel {
  @Field(() => PartnerTransmissionStatus)
  status: PartnerTransmissionStatus;

  @Field(() => [String], { description: 'Channels that accepted the order: WEBHOOK, EMAIL' })
  channels: string[];

  @Field(() => Int)
  attempts: number;

  @Field({ nullable: true })
  lastError?: string;

  @Field({ nullable: true })
  lastAttemptAt?: Date;

  @Field({ nullable: true })
  sentAt?: Date;
}

@ObjectType('PartnerIntegrationStatus')
export class PartnerIntegrationStatusModel {
  @Field()
  webhookConfigured: boolean;

  @Field()
  emailConfigured: boolean;

  @Field({ nullable: true, description: 'PARTNER_NAME, for display' })
  partnerName?: string;
}
