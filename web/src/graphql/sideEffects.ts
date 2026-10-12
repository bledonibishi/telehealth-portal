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

const SCORE_ENTRY_FIELDS = gql`
  fragment SideEffectScoreEntryFields on SideEffectScoreEntry {
    id
    recordedAt
    nausea
    vomiting
    abdominalPain
    diarrhoea
    constipation
    fatigue
    note
  }
`;

export const MY_SIDE_EFFECT_SCORES = gql`
  ${SCORE_ENTRY_FIELDS}
  query MySideEffectScores {
    mySideEffectScores {
      ...SideEffectScoreEntryFields
    }
  }
`;

export const LOG_MY_SIDE_EFFECT_SCORES = gql`
  ${SCORE_ENTRY_FIELDS}
  mutation LogMySideEffectScores($input: LogSideEffectScoresInput!) {
    logMySideEffectScores(input: $input) {
      ...SideEffectScoreEntryFields
      advice
    }
  }
`;
