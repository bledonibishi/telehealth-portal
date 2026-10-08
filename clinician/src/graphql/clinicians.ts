import { gql } from '@apollo/client';

export const GET_CLINICIANS = gql`
  query GetClinicians {
    clinicians {
      id
      email
      firstName
      lastName
      licenseNumber
      licensingBody
      role
      isVerified
      verifiedAt
      mfaEnabled
      specialty
      bio
      languages
      createdAt
    }
  }
`;

export const UPDATE_CLINICIAN_PROFILE = gql`
  mutation UpdateClinicianProfile($input: UpdateClinicianProfileInput!) {
    updateClinicianProfile(input: $input) {
      id
      specialty
      bio
      languages
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

export const VERIFY_CLINICIAN = gql`
  mutation VerifyClinician($input: VerifyClinicianInput!) {
    verifyClinician(input: $input) {
      id
      licenseNumber
      licensingBody
      isVerified
      verifiedAt
    }
  }
`;

export const REVOKE_CLINICIAN_VERIFICATION = gql`
  mutation RevokeClinicianVerification($id: ID!) {
    revokeClinicianVerification(id: $id) {
      id
      isVerified
      verifiedAt
    }
  }
`;
