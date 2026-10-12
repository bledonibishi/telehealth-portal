import { gql } from '@apollo/client';

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

export const MY_TELEHEALTH_CONSENT = gql`
  query MyTelehealthConsent {
    myTelehealthConsent
  }
`;

export const ACCEPT_TELEHEALTH_CONSENT = gql`
  mutation AcceptTelehealthConsent($version: String!) {
    acceptTelehealthConsent(version: $version)
  }
`;

export const SUBMIT_INTAKE = gql`
  mutation SubmitIntake($input: SubmitIntakeQuizInput!) {
    submitIntakeQuiz(input: $input) {
      id
      status
    }
  }
`;
