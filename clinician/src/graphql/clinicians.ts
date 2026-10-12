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
      deactivatedAt
      invitePending
      inviteExpiresAt
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

const INVITE_RESULT = gql`
  fragment InviteResultFields on ClinicianInviteResult {
    emailSent
    inviteUrl
    clinician {
      id
      email
      firstName
      lastName
      role
      invitePending
      inviteExpiresAt
    }
  }
`;

export const CREATE_CLINICIAN = gql`
  ${INVITE_RESULT}
  mutation CreateClinician($input: CreateClinicianInput!) {
    createClinician(input: $input) {
      ...InviteResultFields
    }
  }
`;

export const SEND_CLINICIAN_INVITE = gql`
  ${INVITE_RESULT}
  mutation SendClinicianInvite($id: ID!) {
    sendClinicianInvite(id: $id) {
      ...InviteResultFields
    }
  }
`;

export const UPDATE_CLINICIAN = gql`
  mutation UpdateClinician($input: UpdateClinicianInput!) {
    updateClinician(input: $input) {
      id
      firstName
      lastName
      email
    }
  }
`;

export const DEACTIVATE_CLINICIAN = gql`
  mutation DeactivateClinician($id: ID!) {
    deactivateClinician(id: $id) {
      id
      deactivatedAt
    }
  }
`;

export const REACTIVATE_CLINICIAN = gql`
  mutation ReactivateClinician($id: ID!) {
    reactivateClinician(id: $id) {
      id
      deactivatedAt
    }
  }
`;

export const DELETE_UNUSED_CLINICIAN = gql`
  mutation DeleteUnusedClinician($id: ID!) {
    deleteUnusedClinician(id: $id)
  }
`;
