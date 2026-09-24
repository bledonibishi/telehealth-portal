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
