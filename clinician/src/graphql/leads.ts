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
      riskTag
      riskReasons
      updatedAt
      intakeSavedAt
      referralCode
      stage
      treatment
      deliveryCity
      deliveryCountry
      reminderCount
      remindersStoppedAt
      quizAnswers {
        questionId
        question
        answer
      }
    }
  }
`;
