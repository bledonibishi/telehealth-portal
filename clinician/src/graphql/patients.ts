import { gql } from '@apollo/client';

export const GET_PATIENTS = gql`
  query GetPatients {
    patients {
      id
      email
      firstName
      lastName
      dateOfBirth
      leadId
      activatedAt
      createdAt
    }
  }
`;

export const GET_PATIENT = gql`
  query GetPatient($id: ID!) {
    patient(id: $id) {
      id
      email
      firstName
      lastName
      dateOfBirth
      leadId
      activatedAt
      createdAt
      consultations {
        id
        kind
        status
        submittedAt
        updatedAt
        quizAnswers { questionId question answer }
        redFlags { id description severity }
        prescription { id medication dosage instructions issuedAt pharmacyRef }
        messages { id senderId senderRole content sentAt }
        clinician { id firstName lastName }
      }
      checkIns {
        id
        status
        dueAt
        createdAt
        sentAt
        tokenExpiresAt
        completedAt
        wantsToReorder
        answers { questionId question answer }
        checkInUrl
      }
    }
  }
`;

export const UPDATE_PATIENT = gql`
  mutation UpdatePatient($input: UpdatePatientInput!) {
    updatePatient(input: $input) {
      id
      email
      firstName
      lastName
      dateOfBirth
    }
  }
`;
