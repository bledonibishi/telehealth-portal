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
    motivationMessage
    checkInState
    nextCheckInDueAt
    lastCheckInCompletedAt
    checkInUrl
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

export const MY_WEIGHT_JOURNEY = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  query MyWeightJourney {
    myWeightJourney {
      ...WeightJourneyFields
    }
  }
`;

export const SET_MY_TARGET_WEIGHT = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation SetMyTargetWeight($targetWeightKg: Float!) {
    setMyTargetWeight(targetWeightKg: $targetWeightKg) {
      ...WeightJourneyFields
    }
  }
`;

export const MY_WEIGHT_TIMELINE = gql`
  query MyWeightTimeline($from: DateTime!, $to: DateTime!, $limit: Int) {
    myWeightTimeline(from: $from, to: $to, limit: $limit) {
      truncated
      startingWeightKg
      startingAt
      targetWeightKg
      earliestAt
      latestAt
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

export const ADD_MY_WEIGHT = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation AddMyWeight($input: AddWeightInput!) {
    addMyWeight(input: $input) {
      ...WeightJourneyFields
    }
  }
`;

export const VOID_MY_WEIGHT = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation VoidMyWeight($entryId: ID!) {
    voidMyWeight(entryId: $entryId) {
      ...WeightJourneyFields
    }
  }
`;
