import { ForbiddenException } from '@nestjs/common';
import type { FieldMiddleware } from '@nestjs/graphql';
import { ClinicianRole } from '../common/enums';
import { accessRoleOf } from './access-roles';

/**
 * What the pharmacy partner (PROVIDER) may read inside the records an order links to. An order carries its
 * patient, its prescription and that prescription's consultation, and from those a query could walk on to
 * health records, the questionnaire or messages. So for these three types only the fields a pharmacy needs
 * to pack and ship are allowed; anything else is refused, and a field added later is refused until listed here.
 * Other staff are not affected.
 */
export const PROVIDER_VISIBLE_FIELDS: Record<string, ReadonlySet<string>> = {
  Patient: new Set(['id', 'firstName', 'lastName', 'email', 'phone', 'addressLine1', 'addressLine2', 'city', 'postcode', 'country']),
  Prescription: new Set(['id', 'status', 'medication', 'dosage', 'instructions', 'issuedAt', 'validUntil', 'refillsAllowed', 'documentUrl', 'consultation', 'items']),
  Consultation: new Set(['id', 'kind']),
};

/**
 * Where a parcel goes is our business, not the pharmacy's: we book the courier, and the courier collects from the
 * pharmacy and delivers. So by default the pharmacy gets the patient's name and what to pack, but not their phone or
 * address (they read as empty). Set PHARMACY_SEES_DELIVERY_ADDRESS=true if a pharmacy ever has to ship itself.
 */
const DELIVERY_FIELDS = new Set(['phone', 'addressLine1', 'addressLine2', 'city', 'postcode', 'country']);
const DELIVERY_TYPES = new Set(['Patient', 'DeliveryAddress']);

export const providerFieldGuard: FieldMiddleware = async (ctx, next) => {
  const user = ctx.context?.req?.user;
  if (accessRoleOf(user) !== ClinicianRole.PROVIDER) return next();

  const allowed = PROVIDER_VISIBLE_FIELDS[ctx.info.parentType.name];
  if (allowed && !allowed.has(ctx.info.fieldName)) {
    throw new ForbiddenException(`“${ctx.info.fieldName}” isn’t available to your account`);
  }
  if (DELIVERY_TYPES.has(ctx.info.parentType.name) && DELIVERY_FIELDS.has(ctx.info.fieldName) && process.env.PHARMACY_SEES_DELIVERY_ADDRESS !== 'true') {
    return null;
  }
  return next();
};
