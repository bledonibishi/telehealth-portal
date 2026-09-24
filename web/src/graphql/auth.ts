import { gql } from '@apollo/client';

export const LOGIN_PATIENT = gql`
  mutation LoginPatient($input: LoginInput!) {
    loginPatient(input: $input) {
      accessToken
      patient {
        id
        email
        firstName
        lastName
      }
    }
  }
`;
