import { gql } from '@apollo/client';

// Profile and settings. They match the web portal's operations (web/src/graphql) so both read the same API.

const PROFILE_FIELDS = gql`
  fragment PatientProfileFields on PatientProfile {
    id
    patientNumber
    firstName
    lastName
    email
    dateOfBirth
    phone
    allergies
    emergencyContactName
    emergencyContactPhone
    heightCm
    memberSince
  }
`;

export const MY_PROFILE = gql`
  ${PROFILE_FIELDS}
  query MyProfile {
    myProfile {
      ...PatientProfileFields
    }
  }
`;

export const UPDATE_MY_PROFILE = gql`
  ${PROFILE_FIELDS}
  mutation UpdateMyProfile($input: UpdateMyProfileInput!) {
    updateMyProfile(input: $input) {
      ...PatientProfileFields
    }
  }
`;

export const CHANGE_MY_PASSWORD = gql`
  mutation ChangeMyPassword($currentPassword: String!, $newPassword: String!) {
    changeMyPassword(currentPassword: $currentPassword, newPassword: $newPassword) {
      accessToken
      refreshToken
    }
  }
`;

export const REQUEST_MY_EMAIL_CHANGE = gql`
  mutation RequestMyEmailChange($newEmail: String!, $currentPassword: String!) {
    requestMyEmailChange(newEmail: $newEmail, currentPassword: $currentPassword)
  }
`;

export const CONFIRM_MY_EMAIL_CHANGE = gql`
  mutation ConfirmMyEmailChange($newEmail: String!, $code: String!, $currentPassword: String!) {
    confirmMyEmailChange(newEmail: $newEmail, code: $code, currentPassword: $currentPassword) {
      accessToken
      refreshToken
    }
  }
`;

export const MY_NOTIFICATION_PREFERENCES = gql`
  query MyNotificationPreferences {
    myNotificationPreferences { pushMessages pushOrders pushReminders pushRewards emailUnreadMessages }
  }
`;

export const UPDATE_NOTIFICATION_PREFERENCES = gql`
  mutation UpdateMyNotificationPreferences($input: UpdateNotificationPreferencesInput!) {
    updateMyNotificationPreferences(input: $input) { pushMessages pushOrders pushReminders pushRewards emailUnreadMessages }
  }
`;
