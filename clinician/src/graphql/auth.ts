import { gql } from '@apollo/client';

export const LOGIN_CLINICIAN = gql`
  mutation LoginClinician($input: LoginInput!) {
    loginClinician(input: $input) {
      accessToken
      refreshToken
      pendingToken
      mfaRequired
      clinician {
        id
        email
        firstName
        lastName
        gmcNumber
        isVerified
        mfaEnabled
      }
    }
  }
`;

export const VERIFY_MFA = gql`
  mutation VerifyMfa($pendingToken: String!, $totpCode: String!) {
    verifyMfa(pendingToken: $pendingToken, totpCode: $totpCode) {
      accessToken
      refreshToken
      mfaRequired
      clinician {
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

export const SETUP_MFA = gql`
  mutation SetupMfa {
    setupMfa {
      secret
      otpauthUrl
    }
  }
`;

export const ENABLE_MFA = gql`
  mutation EnableMfa($totpCode: String!) {
    enableMfa(totpCode: $totpCode)
  }
`;
