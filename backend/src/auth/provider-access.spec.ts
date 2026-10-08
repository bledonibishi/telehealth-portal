import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { ClinicianRole } from '../common/enums';
import { ROLES_KEY } from './access-roles';

const SRC = join(__dirname, '..');
const RESOLVER_TYPE = 'graphql:resolver_type';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(resolver|controller)\.ts$/.test(name) ? [path] : [];
  });
}

/** Every GraphQL query and mutation, and every HTTP route, with the roles that may call it (undefined: no role check). */
function operations() {
  const found: Array<{ name: string; roles: string[] | undefined }> = [];
  for (const file of sourceFiles(SRC)) {
    const mod = require(file);
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function' || !exported.prototype) continue;
      const classRoles = Reflect.getMetadata(ROLES_KEY, exported);
      for (const method of Object.getOwnPropertyNames(exported.prototype)) {
        if (method === 'constructor') continue;
        const handler = exported.prototype[method];
        if (typeof handler !== 'function') continue;
        const gql = Reflect.getMetadata(RESOLVER_TYPE, handler);
        const http = Reflect.getMetadata('path', handler) !== undefined && Reflect.getMetadata('method', handler) !== undefined;
        if (gql !== 'Query' && gql !== 'Mutation' && !http) continue;
        found.push({ name: `${exported.name}.${method}`, roles: Reflect.getMetadata(ROLES_KEY, handler) ?? classRoles });
      }
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

describe('what the pharmacy partner (PROVIDER) can reach', () => {
  const all = operations();

  it('finds the operations at all', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('is exactly the fulfilment, account and prescription-to-dispense operations, nothing about patients', () => {
    const reachable = all.filter((o) => o.roles?.includes(ClinicianRole.PROVIDER)).map((o) => o.name);
    expect(reachable).toMatchInlineSnapshot(`
[
  "AuthResolver.enableMfa",
  "AuthResolver.setupMfa",
  "CatalogResolver.products",
  "NotificationsResolver.notificationCounts",
  "PrescriptionDocumentController.document",
  "PrescriptionsResolver.markOrderHandedOver",
  "PrescriptionsResolver.markOrderReadyForPickup",
  "PrescriptionsResolver.orders",
  "PrescriptionsResolver.reportOrderCannotFulfil",
]
`);
  });

  it('has no operation that skips the role check (other than the sign-in and public-form ones listed here)', () => {
    const unchecked = all.filter((o) => !o.roles).map((o) => o.name);
    expect(unchecked).toMatchInlineSnapshot(`
[
  "AuthResolver.acceptClinicianInvite",
  "AuthResolver.activateAccount",
  "AuthResolver.loginClinician",
  "AuthResolver.loginPatient",
  "AuthResolver.refreshAccessToken",
  "AuthResolver.requestActivationLink",
  "AuthResolver.verifyMfa",
  "CalcomWebhookController.receive",
  "CheckInsResolver.checkInByToken",
  "CheckInsResolver.submitCheckIn",
  "CheckoutController.createHostedSession",
  "CheckoutController.createSubscriptionIntent",
  "CheckoutController.prices",
  "CheckoutController.rewards",
  "CheckoutController.saveShipping",
  "CheckoutController.successInfo",
  "ConsentsResolver.consentText",
  "CouriersController.webhook",
  "DeviceReadingsController.ingest",
  "DevPaymentSimulatorController.plans",
  "DevPaymentSimulatorController.simulatePayment",
  "DosingCronController.triggerDoseReminders",
  "EmailVerificationResolver.requestEmailCode",
  "EmailVerificationResolver.verifyEmailCode",
  "IdentityVerificationController.handleWebhook",
  "LeadsResolver.createLead",
  "PartnerOrdersCronController.sweep",
  "QuestionnairesResolver.questionnaire",
  "StripeWebhookController.handleWebhook",
  "UploadsCleanupController.purge",
  "UploadsController.getFile",
  "UploadsController.upload",
]
`);
  });
});
