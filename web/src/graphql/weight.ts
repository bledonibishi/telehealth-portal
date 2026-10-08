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
        hasPhoto
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

export const MY_PROGRESS_PHOTOS = gql`
  query MyProgressPhotos {
    myProgressPhotos {
      entryId
      measuredAt
      weightKg
      photoFileId
      note
    }
  }
`;

export const EDIT_MY_WEIGHT = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation EditMyWeight($input: EditMyWeightInput!) {
    editMyWeight(input: $input) {
      ...WeightJourneyFields
    }
  }
`;

export const MY_WEIGHT_FORECAST = gql`
  query MyWeightForecast {
    myWeightForecast {
      available
      reason
      basedOnPoints
      basedOnDays
      kgPerWeek
      confidence
      fromAt
      fromWeightKg
      reachesTargetAt
      points { at monthsAhead weightKg }
    }
  }
`;

const BODY_MEASUREMENT_FIELDS = gql`
  fragment BodyMeasurementFields on BodyMeasurement {
    id
    measuredAt
    waistCm
    hipsCm
    armCm
  }
`;

export const MY_BODY_MEASUREMENTS = gql`
  ${BODY_MEASUREMENT_FIELDS}
  query MyBodyMeasurements {
    myBodyMeasurements {
      ...BodyMeasurementFields
    }
  }
`;

export const ADD_MY_BODY_MEASUREMENT = gql`
  ${BODY_MEASUREMENT_FIELDS}
  mutation AddMyBodyMeasurement($input: AddBodyMeasurementInput!) {
    addMyBodyMeasurement(input: $input) {
      ...BodyMeasurementFields
    }
  }
`;

export const VOID_MY_BODY_MEASUREMENT = gql`
  ${BODY_MEASUREMENT_FIELDS}
  mutation VoidMyBodyMeasurement($id: ID!) {
    voidMyBodyMeasurement(id: $id) {
      ...BodyMeasurementFields
    }
  }
`;

/** What to reload after a weighing is added, changed or removed. The chart reloads itself (see lib/weights-changed). */
export const WEIGHT_REFETCH = [{ query: MY_WEIGHT_JOURNEY }, { query: MY_PROGRESS_PHOTOS }, { query: MY_WEIGHT_FORECAST }];
