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

export const SUBMIT_INTAKE_QUIZ = gql`
  mutation SubmitIntakeQuiz($input: SubmitIntakeQuizInput!) {
    submitIntakeQuiz(input: $input) {
      id
      kind
      status
      submittedAt
      redFlags {
        id
        description
        severity
      }
    }
  }
`;

export const MY_CONSULTATIONS = gql`
  query MyConsultations {
    myConsultations {
      id
      kind
      status
      submittedAt
      updatedAt
      prescription {
        medication
        dosage
        issuedAt
      }
    }
  }
`;

export const GET_MY_CONSULTATION = gql`
  query GetMyConsultation($id: ID!) {
    consultation(id: $id) {
      id
      kind
      status
      submittedAt
      updatedAt
      redFlags {
        description
        severity
      }
      prescription {
        medication
        dosage
        instructions
        issuedAt
      }
      messages {
        id
        senderId
        senderRole
        content
        sentAt
      }
    }
  }
`;

export const SEND_MESSAGE = gql`
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      id
      senderId
      senderRole
      content
      sentAt
    }
  }
`;

export const NEW_MESSAGE_SUBSCRIPTION = gql`
  subscription NewMessage($consultationId: ID!) {
    newMessage(consultationId: $consultationId) {
      id
      senderId
      senderRole
      content
      sentAt
    }
  }
`;

export const QUESTIONNAIRE = gql`
  query Questionnaire($kind: ConsultationKind!, $stage: QuestionnaireStage!) {
    questionnaire(kind: $kind, stage: $stage) {
      kind
      version
      title
      questions {
        id
        text
        help
        type
        optional
        min
        max
        unit
        options {
          value
          label
          exclusive
        }
        showIf {
          questionId
          anyOf
        }
      }
    }
  }
`;

export const MY_PRODUCT_KIND = gql`
  query MyProductKind {
    myProductKind
  }
`;

export const CONSENT_TEXT = gql`
  query ConsentText($type: ConsentType!) {
    consentText(type: $type) {
      type
      version
      text
    }
  }
`;

export const MY_TREATMENT_PLAN = gql`
  query MyTreatmentPlan {
    myTreatmentPlan {
      prescriptionId
      programme
      productName
      strength
      frequency
      directions
      prescriberName
      startedAt
      validUntil
      weeksElapsed
      durationWeeks
      dosesTaken
      dosesPlanned
      nextDoseAt
      repeatsLeft
    }
  }
`;

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

export const UPDATE_MY_BASIC_INFO = gql`
  ${BASIC_INFO_FIELDS}
  mutation UpdateMyBasicInfo($input: UpdateBasicInfoInput!) {
    updateMyBasicInfo(input: $input) {
      ...BasicInfoFields
    }
  }
`;
