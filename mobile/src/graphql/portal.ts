import { gql } from '@apollo/client';

// The treatment screens' operations. They match the web portal's (web/src/graphql) so both read the same API.

export const MY_PRODUCT_KIND = gql`
  query MyProductKind {
    myProductKind
  }
`;

// ── Weight journey ──────────────────────────────────────────────────────────

const WEIGHT_JOURNEY_FIELDS = gql`
  fragment WeightJourneyFields on WeightJourney {
    patientId
    startingWeightKg
    currentWeightKg
    latestMeasurementAt
    targetWeightKg
    weightLostKg
    remainingKg
    progressPercentage
    motivationMessage
    checkInState
    nextCheckInDueAt
    checkInUrl
    entries {
      checkInId
      month
      date
      weightKg
      changeKg
    }
  }
`;

export const MY_WEIGHT_JOURNEY = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  query MyWeightJourney {
    myWeightJourney {
      ...WeightJourneyFields
    }
  }
`;

export const SET_MY_TARGET_WEIGHT = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation SetMyTargetWeight($targetWeightKg: Float!) {
    setMyTargetWeight(targetWeightKg: $targetWeightKg) {
      ...WeightJourneyFields
    }
  }
`;

export const ADD_MY_WEIGHT = gql`
  ${WEIGHT_JOURNEY_FIELDS}
  mutation AddMyWeight($input: AddWeightInput!) {
    addMyWeight(input: $input) {
      ...WeightJourneyFields
    }
  }
`;

export const MY_WEIGHT_TIMELINE = gql`
  query MyWeightTimeline($from: DateTime!, $to: DateTime!, $limit: Int) {
    myWeightTimeline(from: $from, to: $to, limit: $limit) {
      measurements {
        id
        measuredAt
        weightKg
        kind
      }
    }
  }
`;

const BODY_MEASUREMENT_FIELDS = gql`
  fragment BodyMeasurementFields on BodyMeasurement {
    id
    measuredAt
    waistCm
    hipsCm
    armCm
  }
`;

export const MY_BODY_MEASUREMENTS = gql`
  ${BODY_MEASUREMENT_FIELDS}
  query MyBodyMeasurements {
    myBodyMeasurements {
      ...BodyMeasurementFields
    }
  }
`;

export const ADD_MY_BODY_MEASUREMENT = gql`
  ${BODY_MEASUREMENT_FIELDS}
  mutation AddMyBodyMeasurement($input: AddBodyMeasurementInput!) {
    addMyBodyMeasurement(input: $input) {
      ...BodyMeasurementFields
    }
  }
`;

export const VOID_MY_BODY_MEASUREMENT = gql`
  ${BODY_MEASUREMENT_FIELDS}
  mutation VoidMyBodyMeasurement($id: ID!) {
    voidMyBodyMeasurement(id: $id) {
      ...BodyMeasurementFields
    }
  }
`;

// ── Injections ──────────────────────────────────────────────────────────────

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
      takenAt
      note
      injectionSite
      feelingAfter
      feelingAfterAt
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

export const MY_MISSED_DOSE_STATUS = gql`
  query MyMissedDoseStatus {
    myMissedDoseStatus {
      missedInARow
      needsClinician
    }
  }
`;

// ── Side effects ────────────────────────────────────────────────────────────

const SCORE_ENTRY_FIELDS = gql`
  fragment SideEffectScoreEntryFields on SideEffectScoreEntry {
    id
    recordedAt
    nausea
    vomiting
    abdominalPain
    diarrhoea
    constipation
    fatigue
    note
  }
`;

export const MY_SIDE_EFFECT_SCORES = gql`
  ${SCORE_ENTRY_FIELDS}
  query MySideEffectScores {
    mySideEffectScores {
      ...SideEffectScoreEntryFields
    }
  }
`;

export const LOG_MY_SIDE_EFFECT_SCORES = gql`
  ${SCORE_ENTRY_FIELDS}
  mutation LogMySideEffectScores($input: LogSideEffectScoresInput!) {
    logMySideEffectScores(input: $input) {
      ...SideEffectScoreEntryFields
      advice
    }
  }
`;

export const REPORT_SIDE_EFFECTS = gql`
  mutation ReportSideEffects($input: ReportSideEffectsInput!) {
    reportSideEffects(input: $input) {
      id
      severity
      effects
      createdAt
      advice
    }
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

// ── My doctor, orders, payments ─────────────────────────────────────────────

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
      specialty
      bio
      languages
    }
  }
`;

export const MY_APPOINTMENTS = gql`
  query MyAppointments {
    myAppointments {
      id
      reason
      status
      scheduledFor
      createdAt
      clinicianName
      clinicianNote
    }
  }
`;

export const MY_ORDERS = gql`
  query MyOrders {
    myOrders {
      id
      reference
      sequence
      status
      createdAt
      dispatchedAt
      carrier
      trackingNumber
      trackingUrl
      estimatedDeliveryFrom
      estimatedDeliveryTo
      trackingEvents {
        id
        status
        occurredAt
        location
      }
      outForDeliveryAt
      deliveredAt
      shippingAddress {
        name
        addressLine1
        addressLine2
        city
        postcode
        country
      }
      prescription {
        id
        medication
        dosage
      }
    }
  }
`;

export const ME_BASIC_INFO = gql`
  query MeBasicInfo {
    me {
      id
      addressLine1
      addressLine2
      city
      postcode
      country
    }
  }
`;

export const MY_SUPPLY_STATUS = gql`
  fragment SupplyStatusFields on SupplyStatus {
    subscriptionActive
    medication
    nextSupplyAt
    daysUntilNextSupply
    repeatsLeft
    supplyBeingPrepared
    refillState
    refillOpensInDays
    refillRequestedAt
  }
  query MySupplyStatus {
    mySupplyStatus {
      ...SupplyStatusFields
    }
  }
`;

export const REQUEST_REFILL = gql`
  mutation RequestRefill {
    requestRefill {
      subscriptionActive
      medication
      nextSupplyAt
      daysUntilNextSupply
      repeatsLeft
      supplyBeingPrepared
      refillState
      refillOpensInDays
      refillRequestedAt
    }
  }
`;

export const MY_INVOICES = gql`
  query MyInvoices {
    myInvoices {
      id
      createdAt
      amountCents
      currency
      status
      description
      cardBrand
      cardLast4
      viewUrl
      pdfUrl
    }
  }
`;

export const CREATE_BILLING_PORTAL_SESSION = gql`
  mutation CreateBillingPortalSession {
    createBillingPortalSession {
      url
    }
  }
`;

export const MY_CHECK_IN_REPORTS = gql`
  query MyCheckInReports {
    myCheckInReports {
      id
      weekLabel
      completedAt
      reviewedAt
      outcome
      reportUrl
    }
  }
`;
