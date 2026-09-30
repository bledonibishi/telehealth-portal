import { gql } from '@apollo/client';

export const MY_SYMPTOM_SCALE = gql`
  query MySymptomScale {
    mySymptomScale {
      id
      name
      intro
      minScore
      maxScore
      options {
        score
        label
      }
      domains {
        id
        label
      }
      items {
        id
        text
        domain
      }
    }
  }
`;

const ASSESSMENT_FIELDS = gql`
  fragment SymptomAssessmentFields on SymptomAssessment {
    id
    scale
    recordedAt
    totalScore
    minScore
    maxScore
    severity
    domainScores {
      domain
      label
      score
      min
      max
    }
    answers {
      itemId
      score
    }
  }
`;

export const MY_SYMPTOM_ASSESSMENTS = gql`
  ${ASSESSMENT_FIELDS}
  query MySymptomAssessments {
    mySymptomAssessments {
      ...SymptomAssessmentFields
    }
  }
`;

export const RECORD_MY_SYMPTOMS = gql`
  ${ASSESSMENT_FIELDS}
  mutation RecordMySymptoms($input: RecordSymptomsInput!) {
    recordMySymptoms(input: $input) {
      ...SymptomAssessmentFields
    }
  }
`;
