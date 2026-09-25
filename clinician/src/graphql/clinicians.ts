import { gql } from '@apollo/client';

export const GET_CLINICIANS = gql`
  query GetClinicians {
    clinicians {
      id
      email
      firstName
      lastName
      gmcNumber
      role
      isVerified
      mfaEnabled
      createdAt
    }
  }
`;

export const UPDATE_CLINICIAN_ROLE = gql`
  mutation UpdateClinicianRole($id: ID!, $role: ClinicianRole!) {
    updateClinicianRole(id: $id, role: $role) {
      id
      role
    }
  }
`;
