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

  @Field({ description: 'Which message this is about: order.created, or order.cancelled once a withdrawn order is being reported to the partner' })
  event: string;

  @Field(() => [String], { description: 'Channels that accepted the message: WEBHOOK, EMAIL' })
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

  @Field({ nullable: true, description: 'Set when delivery is only half set up, e.g. a webhook URL without its secret' })
  configurationProblem?: string;
}
