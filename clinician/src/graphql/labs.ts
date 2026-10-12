import { gql } from '@apollo/client';

const LAB_RESULT_FIELDS = gql`
  fragment LabResultFields on LabResult {
    id
    patientId
    kind
    analyteName
    value
    unit
    referenceRangeLow
    referenceRangeHigh
    flagged
    collectedAt
    note
    reviewedAt
    reviewNote
    reportId
    reportUrl
    enteredBy {
      firstName
      lastName
    }
    reviewedBy {
      firstName
      lastName
    }
  }
`;

const TRT_MONITORING_FIELDS = gql`
  fragment TrtMonitoringFields on TrtMonitoring {
    patientId
    startedAt
    refillsOnHold
    holdReasons
    warnings
    labs {
      kind
      dueAt
      overdue
      lastValue
      lastUnit
      lastCollectedAt
    }
  }
`;

export const PATIENT_LAB_RESULTS = gql`
  ${LAB_RESULT_FIELDS}
  query PatientLabResults($patientId: ID!) {
    patientLabResults(patientId: $patientId) {
      ...LabResultFields
    }
  }
`;

export const FLAGGED_LAB_RESULT_QUEUE = gql`
  ${LAB_RESULT_FIELDS}
  query FlaggedLabResultQueue {
    flaggedLabResultQueue {
      ...LabResultFields
      patient {
        id
        firstName
        lastName
      }
    }
  }
`;

export const PATIENT_TRT_MONITORING = gql`
  ${TRT_MONITORING_FIELDS}
  query PatientTrtMonitoring($patientId: ID!) {
    patientTrtMonitoring(patientId: $patientId) {
      ...TrtMonitoringFields
    }
  }
`;

export const TRT_MONITORING_QUEUE = gql`
  ${TRT_MONITORING_FIELDS}
  query TrtMonitoringQueue {
    trtMonitoringQueue {
      patientName
      monitoring {
        ...TrtMonitoringFields
      }
    }
  }
`;

export const RECORD_LAB_RESULT = gql`
  mutation RecordLabResult($input: RecordLabResultInput!) {
    recordLabResult(input: $input) {
      id
    }
  }
`;

export const REVIEW_LAB_RESULT = gql`
  mutation ReviewLabResult($input: ReviewLabResultInput!) {
    reviewLabResult(input: $input) {
      id
    }
  }
`;

const LAB_REPORT_FIELDS = gql`
  fragment LabReportFields on LabReport {
    id
    patientId
    source
    status
    note
    filename
    mimeType
    fileUrl
    createdAt
    handledAt
    resultCount
  }
`;

export const PATIENT_LAB_REPORTS = gql`
  ${LAB_REPORT_FIELDS}
  query PatientLabReports($patientId: ID!) {
    patientLabReports(patientId: $patientId) {
      ...LabReportFields
    }
  }
`;

export const READ_LAB_REPORT = gql`
  mutation ReadLabReport($reportId: ID!) {
    readLabReport(reportId: $reportId) {
      status
      reason
      patientNameOnReport
      nameMatches
      labName
      reportDate
      notes
      warnings
      results {
        kind
        analyteName
        value
        unit
        referenceLow
        referenceHigh
        collectedOn
        flaggedByLab
        alreadyRecorded
      }
    }
  }
`;

export const RECORD_LAB_RESULTS = gql`
  mutation RecordLabResults($input: RecordLabResultsInput!) {
    recordLabResults(input: $input) {
      id
    }
  }
`;

export const REJECT_LAB_REPORT = gql`
  ${LAB_REPORT_FIELDS}
  mutation RejectLabReport($input: RejectLabReportInput!) {
    rejectLabReport(input: $input) {
      ...LabReportFields
    }
  }
`;
