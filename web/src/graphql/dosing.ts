import { gql } from '@apollo/client';

export const MY_DOSE_CALENDAR = gql`
  query MyDoseCalendar($fromDays: Int, $toDays: Int) {
    myDoseCalendar(fromDays: $fromDays, toDays: $toDays) {
      id
      scheduledFor
      status
      takenAt
      note
      product {
        id
        name
        brandName
        category
        requiresColdChain
      }
      strength {
        id
        label
        titrationStep
      }
    }
  }
`;

export const MARK_DOSE_TAKEN = gql`
  mutation MarkDoseTaken($id: ID!) {
    markDoseTaken(id: $id) {
      id
      status
      takenAt
    }
  }
`;

export const MARK_DOSE_SKIPPED = gql`
  mutation MarkDoseSkipped($id: ID!, $note: String) {
    markDoseSkipped(id: $id, note: $note) {
      id
      status
      note
    }
  }
`;

export const UNMARK_DOSE = gql`
  mutation UnmarkDose($id: ID!) {
    unmarkDose(id: $id) {
      id
      status
    }
  }
`;
