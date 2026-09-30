import { gql } from '@apollo/client';

const BASIC_INFO_FIELDS = gql`
  fragment BasicInfoFields on Patient {
    id
    firstName
    lastName
    dateOfBirth
    phone
    addressLine1
    addressLine2
    city
    postcode
    country
  }
`;

export const ME_BASIC_INFO = gql`
  ${BASIC_INFO_FIELDS}
  query MeBasicInfo {
    me {
      ...BasicInfoFields
    }
  }
`;

export const ME_NAME = gql`
  query MeName {
    me {
      id
      firstName
    }
  }
`;

export const UPDATE_MY_BASIC_INFO = gql`
  ${BASIC_INFO_FIELDS}
  mutation UpdateMyBasicInfo($input: UpdateBasicInfoInput!) {
    updateMyBasicInfo(input: $input) {
      ...BasicInfoFields
    }
  }
`;
