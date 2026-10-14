import { gql } from '@apollo/client';

export const MY_DASHBOARD_LAYOUT = gql`
  query MyDashboardLayout {
    myDashboardLayout {
      top
      main
      side
      hidden
      sizes {
        id
        size
      }
      staffHidden {
        id
        until
      }
    }
  }
`;

export const SAVE_MY_DASHBOARD_LAYOUT = gql`
  mutation SaveMyDashboardLayout($input: DashboardLayoutInput!) {
    saveMyDashboardLayout(input: $input) {
      top
      main
      side
      hidden
      sizes {
        id
        size
      }
      staffHidden {
        id
        until
      }
    }
  }
`;

export const RESET_MY_DASHBOARD_LAYOUT = gql`
  mutation ResetMyDashboardLayout {
    resetMyDashboardLayout {
      top
      main
      side
      hidden
      sizes {
        id
        size
      }
      staffHidden {
        id
        until
      }
    }
  }
`;
