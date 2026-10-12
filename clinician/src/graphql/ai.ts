import { gql } from '@apollo/client';

export const AI_FEATURES = gql`
  query AiFeatures {
    aiFeatures
  }
`;

export const GENERATE_CHECK_IN_BRIEF = gql`
  mutation GenerateCheckInBrief($checkInId: ID!, $language: String!, $force: Boolean) {
    generateCheckInBrief(checkInId: $checkInId, language: $language, force: $force) {
      headline
      removed
      model
      generatedAt
      cached
      bullets {
        text
        importance
        sources {
          id
          label
          text
        }
      }
    }
  }
`;

export const DRAFT_MESSAGE_REPLY = gql`
  mutation DraftMessageReply($input: DraftReplyInput!) {
    draftMessageReply(input: $input) {
      draft
      language
      needsClinician
      reason
    }
  }
`;

export const TRANSLATE_MESSAGE = gql`
  mutation TranslateMessage($messageId: ID!, $target: String!) {
    translateMessage(messageId: $messageId, target: $target) {
      text
      sourceLanguage
      cached
    }
  }
`;

export const INTERPRET_PATIENT_SEARCH = gql`
  mutation InterpretPatientSearch($query: String!) {
    interpretPatientSearch(query: $query) {
      programme
      status
      reviewStatus
      bmiRange
      joined
      quick
      medication
      text
      unsupported
    }
  }
`;

export const URGENT_MESSAGES = gql`
  query UrgentMessages($patientId: ID!) {
    urgentMessages(patientId: $patientId) {
      messageId
      reason
      sentAt
      readAt
    }
  }
`;

export const PATIENTS_WITH_URGENT_MESSAGES = gql`
  query PatientsWithUrgentMessages {
    patientsWithUrgentMessages
  }
`;
