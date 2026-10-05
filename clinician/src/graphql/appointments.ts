import { gql } from '@apollo/client';

const FIELDS = gql`
  fragment AppointmentAlertFields on AppointmentAlert {
    id
    patientId
    patientName
    reason
    details
    painLevel
    redFlags
    urgency
    emergencyAdvised
    preferredTimes
    status
    respondBy
    overdue
    scheduledFor
    meetingUrl
    clinicianNote
    clinicianName
    createdAt
  }
`;

export const APPOINTMENT_REQUESTS = gql`
  ${FIELDS}
  query AppointmentRequests {
    appointmentRequests {
      ...AppointmentAlertFields
    }
  }
`;

export const SCHEDULE_APPOINTMENT = gql`
  mutation ScheduleAppointment($input: ScheduleAppointmentInput!) {
    scheduleAppointment(input: $input) { id status scheduledFor meetingUrl clinicianNote }
  }
`;

export const COMPLETE_APPOINTMENT = gql`
  mutation CompleteAppointment($id: ID!, $note: String) {
    completeAppointment(id: $id, note: $note) { id status }
  }
`;

export const CANCEL_APPOINTMENT = gql`
  mutation CancelAppointment($id: ID!, $note: String!) {
    cancelAppointment(id: $id, note: $note) { id status }
  }
`;
