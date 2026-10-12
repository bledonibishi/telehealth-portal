import { gql } from '@apollo/client';

export const LOGIN_PATIENT = gql`
  mutation LoginPatient($input: LoginInput!) {
    loginPatient(input: $input) {
      accessToken
      refreshToken
      patient {
        id
        email
        firstName
        lastName
      }
    }
  }
`;

export const REFRESH_ACCESS_TOKEN = gql`
  mutation RefreshAccessToken($refreshToken: String!) {
    refreshAccessToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

export const REQUEST_PASSWORD_RESET = gql`
  mutation RequestPatientPasswordReset($input: RequestPasswordResetInput!) {
    requestPatientPasswordReset(input: $input)
  }
`;

export const RESET_PASSWORD = gql`
  mutation ResetPassword($input: ResetPasswordInput!) {
    resetPassword(input: $input)
  }
`;

export const REQUEST_ACTIVATION_LINK = gql`
  mutation RequestActivationLink($input: RequestActivationLinkInput!) {
    requestActivationLink(input: $input)
  }
`;

export const ACTIVATE_ACCOUNT = gql`
  mutation ActivateAccount($input: ActivateAccountInput!) {
    activateAccount(input: $input) {
      accessToken
      refreshToken
      patient {
        id
        email
        firstName
        lastName
      }
    }
  }
`;
