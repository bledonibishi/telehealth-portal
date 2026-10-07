import { gql } from '@apollo/client';

export const MY_DOSE_CALENDAR = gql`
  query MyDoseCalendar($fromDays: Int, $toDays: Int) {
    myDoseCalendar(fromDays: $fromDays, toDays: $toDays) {
      id
      scheduledFor
      status
      takenAt
      note
      injectionSite
      feelingAfter
      feelingAfterAt
      product {
        id
        name
        brandName
        form
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
  mutation MarkDoseTaken($id: ID!, $injectionSite: InjectionSite) {
    markDoseTaken(id: $id, injectionSite: $injectionSite) {
      id
      status
      takenAt
      injectionSite
    }
  }
`;

export const LOG_DOSE_FEELING = gql`
  mutation LogDoseFeeling($id: ID!, $feeling: CheckInFeeling!) {
    logDoseFeeling(id: $id, feeling: $feeling) {
      id
      feelingAfter
      feelingAfterAt
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

export const MY_MISSED_DOSE_STATUS = gql`
  query MyMissedDoseStatus {
    myMissedDoseStatus {
      missedInARow
      needsClinician
    }
  }
`;

export const MY_DOSE_SUMMARY = gql`
  query MyDoseSummary {
    myDoseSummary {
      current
      nextDoseId
      nextDoseAt
    }
  }
`;
