import { gql } from '@apollo/client';

export const GET_DASHBOARD_METRICS = gql`
  query GetDashboardMetrics {
    dashboardMetrics {
      totalLeads
      leadsThisWeek
      newLeadsToday
      totalPatients
      activePatients
      newPatientsThisWeek
      conversionRate
      pendingConsultations
      approvedConsultations
      pendingOrders
      dispatchedOrders
    }
  }
`;
