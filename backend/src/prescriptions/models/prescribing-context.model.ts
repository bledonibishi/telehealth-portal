import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType('PrescribingContext', {
  description: 'What to keep in mind when choosing a consultation’s first dose: what was paid for and what the proof showed',
})
export class PrescribingContextModel {
  @Field({ nullable: true, description: 'The treatment chosen and paid for at checkout, e.g. "Mounjaro 7.5 mg"' })
  orderedTreatment?: string;

  @Field({ nullable: true, description: 'Whether the patient says they have used the medicine before' })
  priorMedicationUse?: boolean;

  @Field({ description: 'Used it before but has no proof — start-dose rules apply' })
  noProof: boolean;

  @Field({ nullable: true, description: 'The medicine and dose read off the prescription proof, e.g. "Mounjaro 2.5 mg"' })
  proofDose?: string;

  @Field({ nullable: true, description: 'The proof check’s risk level: OK, UNVERIFIED, CAUTION or HIGH' })
  proofRiskLevel?: string;

  @Field({ nullable: true, description: 'The highest dose the proof check considers a safe next step' })
  safeNextDose?: string;

  @Field({ description: 'The patient already has an active prescription (then this isn’t a first dose)' })
  hasActivePrescription: boolean;
}
