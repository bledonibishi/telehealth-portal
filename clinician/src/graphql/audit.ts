import { gql } from '@apollo/client';

export const GET_AUDIT_LOG = gql`
  query GetAuditLog($filter: AuditLogFilterInput) {
    auditLog(filter: $filter) {
      nextCursor
      entries {
        id
        timestamp
        actorId
        actorName
        actorRole
        action
        resourceType
        resourceId
        patientId
        patientName
        metadata
      }
    }
  }
`;

export const RECORD_DATA_EXPORT = gql`
  mutation RecordDataExport($input: RecordDataExportInput!) {
    recordDataExport(input: $input)
  }
`;
