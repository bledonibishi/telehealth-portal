import { gql } from '@apollo/client';

export const GET_LEADS = gql`
  query GetLeads {
    leads {
      id
      email
      firstName
      lastName
      productKind
      stripeSessionId
      convertedAt
      createdAt
      quizAnswers {
        questionId
        question
        answer
      }
    }
  }
`;
