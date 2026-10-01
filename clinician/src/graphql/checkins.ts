import { gql } from '@apollo/client';
import { PRESCRIPTION_FRAGMENT } from './consultations';

export const RESCHEDULE_CHECK_IN = gql`
  mutation RescheduleCheckIn($id: ID!, $dueAt: DateTime!) {
    rescheduleCheckIn(id: $id, dueAt: $dueAt) {
      id
      status
      dueAt
    }
  }
`;

const CHECK_IN_REVIEW_FIELDS = gql`
  ${PRESCRIPTION_FRAGMENT}
  fragment CheckInReviewFields on CheckIn {
    id
    status
    kind
    dueAt
    completedAt
    wantsToReorder
    questionnaireVersion
    answers {
      questionId
      question
      answer
      value
    }
    redFlags {
      severity
      description
    }
    patient {
      id
      firstName
      lastName
      email
      dateOfBirth
    }
    prescription {
      ...PrescriptionFields
    }
    reviewedAt
    reviewedBy {
      id
      lastName
    }
    outcome
    reviewNote
    billingNote
    resultOrderId
    resultPrescriptionId
  }
`;

export const CHECK_IN_REVIEW_QUEUE = gql`
  ${CHECK_IN_REVIEW_FIELDS}
  query CheckInReviewQueue {
    checkInReviewQueue {
      ...CheckInReviewFields
    }
  }
`;

export const REVIEW_CHECK_IN = gql`
  ${CHECK_IN_REVIEW_FIELDS}
  mutation ReviewCheckIn($input: ReviewCheckInInput!) {
    reviewCheckIn(input: $input) {
      ...CheckInReviewFields
    }
  }
`;

export const PATIENT_TRENDS = gql`
  query PatientTrends($id: ID!) {
    patient(id: $id) {
      id
      consultations {
        id
        kind
        submittedAt
        quizAnswers {
          questionId
          answer
          value
        }
      }
      checkIns {
        id
        completedAt
        answers {
          questionId
          value
        }
      }
    }
  }
`;

export const MISSED_DOSE_ALERTS = gql`
  query MissedDoseAlerts {
    missedDoseAlerts {
      patientId
      patientName
      productName
      strengthLabel
      titrationStep
      missedInARow
      missedSince
      lastTakenAt
    }
  }
`;
