import { gql } from '@apollo/client';

export const LOGIN_CLINICIAN = gql`
  mutation LoginClinician($input: LoginInput!) {
    loginClinician(input: $input) {
      accessToken
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
