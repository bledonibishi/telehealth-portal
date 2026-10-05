import { gql } from '@apollo/client';

export const BOOKING_FIELDS = gql`
  fragment BookingFields on Booking {
    id
    uid
    purpose
    referenceId
    status
    title
    startsAt
    endsAt
    meetingUrl
    location
    hostName
    cancelReason
    canReschedule
  }
`;

const SESSION_FIELDS = gql`
  ${BOOKING_FIELDS}
  fragment BookingSessionFields on BookingSession {
    purpose
    label
    calLink
    calOrigin
    name
    email
    token
    notes
    rescheduleUid
    current {
      ...BookingFields
    }
  }
`;

export const BOOKING_SESSION = gql`
  ${SESSION_FIELDS}
  query BookingSession($purpose: String!, $referenceId: ID) {
    bookingSession(purpose: $purpose, referenceId: $referenceId) {
      ...BookingSessionFields
    }
  }
`;

/** A session that opens the scheduler on one of the patient's own bookings, to move it. */
export const RESCHEDULE_SESSION = gql`
  ${SESSION_FIELDS}
  query RescheduleSession($uid: String!) {
    rescheduleSession(uid: $uid) {
      ...BookingSessionFields
    }
  }
`;

export const MY_BOOKINGS = gql`
  ${BOOKING_FIELDS}
  query MyBookings {
    myBookings {
      ...BookingFields
    }
  }
`;

export const MY_PAST_BOOKINGS = gql`
  ${BOOKING_FIELDS}
  query MyPastBookings {
    myPastBookings {
      ...BookingFields
    }
  }
`;

export const CANCEL_MY_BOOKING = gql`
  ${BOOKING_FIELDS}
  mutation CancelMyBooking($uid: String!, $reason: String) {
    cancelMyBooking(uid: $uid, reason: $reason) {
      ...BookingFields
    }
  }
`;

/** For the clinical team: everything booked in a window, optionally for one patient. */
export const STAFF_BOOKINGS = gql`
  query StaffBookings($from: DateTime, $to: DateTime, $patientId: ID) {
    bookings(from: $from, to: $to, patientId: $patientId) {
      id
      uid
      purpose
      referenceId
      status
      title
      startsAt
      endsAt
      meetingUrl
      location
      hostName
      patientId
      attendeeName
      attendeeEmail
      clinicianId
    }
  }
`;
