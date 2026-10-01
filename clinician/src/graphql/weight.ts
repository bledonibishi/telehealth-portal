import { gql } from '@apollo/client';

const WEIGHT_JOURNEY_FIELDS = gql`
  fragment WeightJourneyFields on WeightJourney {
    patientId
    startingWeightKg
    currentWeightKg
    latestMeasurementAt
    targetWeightKg
    weightLostKg
    remainingKg
    progressPercentage
    checkInState
    nextCheckInDueAt
    lastCheckInCompletedAt
    entries {
      checkInId
      month
      date
      weightKg
      previousWeightKg
      changeKg
      feeling
      note
    }
  }
`;

export const GET_WEIGHT_JOURNEY = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  query WeightJourneyForPatient($patientId: ID!) {
    weightJourneyForPatient(patientId: $patientId) {
      ...WeightJourneyFields
    }
  }
`;

export const CORRECT_WEIGHT_GOAL = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation CorrectWeightGoal($input: CorrectWeightGoalInput!) {
    correctWeightGoal(input: $input) {
      ...WeightJourneyFields
    }
  }
`;

export const CORRECT_CHECK_IN_WEIGHT = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation CorrectCheckInWeight($input: CorrectCheckInWeightInput!) {
    correctCheckInWeight(input: $input) {
      ...WeightJourneyFields
    }
  }
`;

export const GET_WEIGHT_TIMELINE = gql`
  query WeightTimelineForPatient($patientId: ID!, $from: DateTime!, $to: DateTime!, $limit: Int) {
    weightTimelineForPatient(patientId: $patientId, from: $from, to: $to, limit: $limit) {
      truncated
      measurements {
        id
        measuredAt
        weightKg
        kind
        changeKg
        note
        feeling
      }
    }
  }
`;

export const CORRECT_WEIGHT_ENTRY = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation CorrectWeightEntry($input: CorrectWeightEntryInput!) {
    correctWeightEntry(input: $input) {
      ...WeightJourneyFields
    }
  }
`;

export const VOID_WEIGHT_ENTRY = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation VoidWeightEntry($entryId: ID!, $reason: String!) {
    voidWeightEntry(entryId: $entryId, reason: $reason) {
      ...WeightJourneyFields
    }
  }
`;

// What the patient detail chart plots: every weighing in the window, plus where the line starts and ends.
export const GET_WEIGHT_CHART = gql`
  query WeightChartForPatient($patientId: ID!, $from: DateTime!, $to: DateTime!, $limit: Int) {
    weightTimelineForPatient(patientId: $patientId, from: $from, to: $to, limit: $limit) {
      startingWeightKg
      startingAt
      targetWeightKg
      measurements {
        id
        measuredAt
        weightKg
        kind
      }
    }
  }
`;
