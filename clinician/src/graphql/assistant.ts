import { gql } from '@apollo/client';

export const ASSISTANT_REVIEW = gql`
  query AssistantReview($days: Int) {
    assistantReview(days: $days) {
      days
      answers
      ratedGood
      ratedBad
      handedOver
      resolvedByAssistant
      recentAnswers {
        id
        content
        sentAt
        patientName
        articleId
        articleTitle
        rating
        ratingNote
      }
      recentHandovers {
        id
        patientId
        patientName
        reason
        at
        ticketId
        ticketNumber
        ticketSubject
      }
    }
  }
`;

export const RATE_ASSISTANT_ANSWER = gql`
  mutation RateAssistantAnswer($messageId: ID!, $rating: String!, $note: String) {
    rateAssistantAnswer(messageId: $messageId, rating: $rating, note: $note) {
      id
      rating
      ratingNote
    }
  }
`;

export const SUPPORT_ARTICLES = gql`
  query SupportArticles {
    supportArticles {
      id
      title
      body
      handoff
      active
      updatedAt
    }
  }
`;

export const SAVE_SUPPORT_ARTICLE = gql`
  mutation SaveSupportArticle($input: SupportArticleInput!) {
    saveSupportArticle(input: $input) {
      id
      title
      body
      handoff
      active
      updatedAt
    }
  }
`;

export const SET_SUPPORT_ARTICLE_ACTIVE = gql`
  mutation SetSupportArticleActive($id: ID!, $active: Boolean!) {
    setSupportArticleActive(id: $id, active: $active) {
      id
      active
    }
  }
`;

export const PATIENT_DASHBOARD_CARDS = gql`
  query PatientDashboardCards($patientId: ID!) {
    patientDashboardCards(patientId: $patientId) {
      id
      title
      state
      canHide
      until
      reason
    }
  }
`;

export const SET_PATIENT_DASHBOARD_CARD = gql`
  mutation SetPatientDashboardCard($input: DashboardHoldInput!) {
    setPatientDashboardCard(input: $input) {
      id
      title
      state
      canHide
      until
      reason
    }
  }
`;
