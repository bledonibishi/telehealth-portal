import { gql } from '@apollo/client';

export const REVENUE_OVERVIEW = gql`
  query RevenueOverview($days: Int) {
    revenueOverview(days: $days) {
      configured
      periodDays
      asOf
      activeSubscribers
      pastDueSubscribers
      mrr { currency amountCents }
      newSubscribers
      cancellations
      clinicalDeclines
      churnRate
      truncated
      error
    }
  }
`;

export const SALES_FUNNEL = gql`
  query SalesFunnel($days: Int) {
    salesFunnel(days: $days) {
      periodDays
      stages { key count percentOfPrevious percentOfFirst }
    }
  }
`;

export const CLINICIAN_PERFORMANCE = gql`
  query ClinicianPerformance($days: Int) {
    clinicianPerformance(days: $days) {
      clinicianId
      name
      email
      role
      isVerified
      status
      casesDecided
      approved
      declined
      moreInfoRequests
      approvalRate
      avgDecisionMinutes
      medianDecisionMinutes
      prescriptionsIssued
      checkInsReviewed
      openCases
    }
  }
`;
