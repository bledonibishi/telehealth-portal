import { gql } from '@apollo/client';

export const REPORT_SIDE_EFFECTS = gql`
  mutation ReportSideEffects($input: ReportSideEffectsInput!) {
    reportSideEffects(input: $input) {
      id
      severity
      effects
      createdAt
      advice
    }
  }
`;
