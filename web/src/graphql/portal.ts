import { gql } from '@apollo/client';

const PROFILE_FIELDS = gql`
  fragment PatientProfileFields on PatientProfile {
    id
    patientNumber
    firstName
    lastName
    email
    dateOfBirth
    gender
    heightCm
    heightFromIntake
    phone
    addressLine1
    addressLine2
    city
    postcode
    country
    allergies
    emergencyContactName
    emergencyContactPhone
    verified
    memberSince
  }
`;

export const MY_PROFILE = gql`
  ${PROFILE_FIELDS}
  query MyProfile {
    myProfile {
      ...PatientProfileFields
    }
  }
`;

export const UPDATE_MY_PROFILE = gql`
  ${PROFILE_FIELDS}
  mutation UpdateMyProfile($input: UpdateMyProfileInput!) {
    updateMyProfile(input: $input) {
      ...PatientProfileFields
    }
  }
`;

export const MY_TREATMENT_PLAN = gql`
  query MyTreatmentPlan {
    myTreatmentPlan {
      prescriptionId
      kind
      programme
      productName
      genericName
      strength
      titrationStep
      frequency
      dosesPerWeek
      directions
      prescriberName
      startedAt
      validUntil
      durationWeeks
      weeksElapsed
      dosesTaken
      dosesPlanned
      supplyDosesTotal
      supplyDosesTaken
      nextDoseAt
      repeatsLeft
    }
  }
`;

const APPOINTMENT_FIELDS = gql`
  fragment AppointmentFields on AppointmentRequest {
    id
    reason
    details
    painLevel
    redFlags
    urgency
    emergencyAdvised
    preferredTimes
    status
    respondBy
    scheduledFor
    meetingUrl
    clinicianNote
    clinicianName
    createdAt
    bookingPurpose
  }
`;

export const MY_APPOINTMENTS = gql`
  ${APPOINTMENT_FIELDS}
  query MyAppointments {
    myAppointments {
      ...AppointmentFields
    }
  }
`;

export const REQUEST_APPOINTMENT = gql`
  ${APPOINTMENT_FIELDS}
  mutation RequestAppointment($input: RequestAppointmentInput!) {
    requestAppointment(input: $input) {
      ...AppointmentFields
      advice
    }
  }
`;

export const CANCEL_MY_APPOINTMENT = gql`
  ${APPOINTMENT_FIELDS}
  mutation CancelMyAppointment($id: ID!) {
    cancelMyAppointment(id: $id) {
      ...AppointmentFields
    }
  }
`;

export const MY_PRESCRIPTIONS_BRIEF = gql`
  query MyPrescriptionsBrief {
    myPrescriptions {
      id
      medication
      dosage
      status
      issuedAt
    }
  }
`;

export const MY_CARE_TEAM = gql`
  query MyCareTeam {
    myCareTeam {
      id
      name
      role
      licensingBody
      primary
      involvement
      since
    }
  }
`;

export const CHANGE_MY_PASSWORD = gql`
  mutation ChangeMyPassword($currentPassword: String!, $newPassword: String!) {
    changeMyPassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export const MY_SIDE_EFFECT_REPORTS = gql`
  query MySideEffectReports {
    mySideEffectReports {
      id
      effects
      severity
      note
      createdAt
      acknowledgedAt
    }
  }
`;

/** Every prescription the patient has had, newest first, with what is needed to open its PDF. */
export const MY_PRESCRIPTION_HISTORY = gql`
  query MyPrescriptionHistory {
    myPrescriptions {
      id
      medication
      dosage
      status
      issuedAt
      validUntil
      documentUrl
      prescriber {
        id
        firstName
        lastName
      }
    }
  }
`;

export const MY_LAB_RESULTS = gql`
  query MyLabResults {
    myLabResults {
      id
      kind
      analyteName
      value
      unit
      collectedAt
      flagged
      referenceRangeLow
      referenceRangeHigh
    }
  }
`;
