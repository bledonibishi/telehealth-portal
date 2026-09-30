import { gql } from '@apollo/client';

export const PATIENT_SYMPTOM_ASSESSMENTS = gql`
  query PatientSymptomAssessments($patientId: ID!) {
    patientSymptomAssessments(patientId: $patientId) {
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
  }
`;

export const SYMPTOM_SCALE_DEFINITION = gql`
  query SymptomScaleDefinition($scale: SymptomScale!) {
    symptomScaleDefinition(scale: $scale) {
      id
      name
      options {
        score
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
