import { gql } from '@apollo/client';

export const PRODUCTS = gql`
  query Products($kind: ConsultationKind, $includeInactive: Boolean) {
    products(kind: $kind, includeInactive: $includeInactive) {
      id
      slug
      name
      brandName
      kind
      category
      form
      requiresColdChain
      weeksPerStep
      defaultDirections
      active
      strengths {
        id
        label
        packDescription
        titrationStep
        defaultQuantity
        active
      }
    }
  }
`;

export const SET_PRODUCT_ACTIVE = gql`
  mutation SetProductActive($id: ID!, $active: Boolean!) {
    setProductActive(id: $id, active: $active) {
      id
      active
    }
  }
`;

export const SET_PRODUCT_STRENGTH_ACTIVE = gql`
  mutation SetProductStrengthActive($id: ID!, $active: Boolean!) {
    setProductStrengthActive(id: $id, active: $active) {
      id
      strengths {
        id
        active
      }
    }
  }
`;

export const PRESCRIPTION_TEMPLATES = gql`
  query PrescriptionTemplates($kind: ConsultationKind!) {
    prescriptionTemplates(kind: $kind) {
      id
      name
      description
      validityDays
      refillsAllowed
      notes
      items {
        productId
        strengthId
        quantity
        directions
      }
    }
  }
`;
