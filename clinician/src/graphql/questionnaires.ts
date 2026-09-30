import { gql } from '@apollo/client';

export const GET_QUESTIONNAIRE = gql`
  query GetQuestionnaire($kind: ConsultationKind!, $stage: QuestionnaireStage!) {
    questionnaire(kind: $kind, stage: $stage) {
      title
      questions {
        id
        text
        help
        type
        optional
        options {
          value
          label
          exclusive
        }
        min
        max
        unit
        showIf {
          questionId
          anyOf
        }
      }
    }
  }
`;
