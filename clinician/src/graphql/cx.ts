import { gql } from '@apollo/client';

export const CX_WORK_QUEUE = gql`
  query CxWorkQueue {
    cxWorkQueue {
      leadsThisWeek
      paidThisWeek
      activatedThisWeek
      tasks {
        id
        kind
        name
        email
        phone
        programme
        since
        patientId
        leadId
        sentBack
        lastContactedAt
        lastContactedBy
      }
    }
  }
`;

export const MARK_LEAD_CONTACTED = gql`
  mutation MarkLeadContacted($leadId: ID!) {
    markLeadContacted(leadId: $leadId)
  }
`;

export const STOP_LEAD_FOLLOW_UP = gql`
  mutation StopLeadFollowUp($leadId: ID!) {
    stopLeadFollowUp(leadId: $leadId)
  }
`;
