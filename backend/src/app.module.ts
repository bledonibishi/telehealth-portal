import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { providerFieldGuard } from './auth/provider-field-guard';
import { formatGraphQLError } from './common/errors/graphql-error-formatter';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CliniciansModule } from './clinicians/clinicians.module';
import { PatientsModule } from './patients/patients.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { CatalogModule } from './catalog/catalog.module';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';
import { ConsentsModule } from './consents/consents.module';
import { MessagingModule } from './messaging/messaging.module';
import { LeadsModule } from './leads/leads.module';
import { ReferralsModule } from './referrals/referrals.module';
import { StripeModule } from './stripe/stripe.module';
import { PushModule } from './push/push.module';
import { CouriersModule } from './couriers/couriers.module';
import { CheckoutModule } from './checkout/checkout.module';
import { EmailModule } from './email/email.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NotifierModule } from './notifications/notifier.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PostHogModule } from './posthog/posthog.module';
import { LangfuseModule } from './langfuse/langfuse.module';
import { UploadsModule } from './uploads/uploads.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { IdentityVerificationModule } from './identity-verification/identity-verification.module';
import { CheckInsModule } from './check-ins/check-ins.module';
import { WeightJourneyModule } from './weight-journey/weight-journey.module';
import { DosingModule } from './dosing/dosing.module';
import { SymptomsModule } from './symptoms/symptoms.module';
import { SideEffectsModule } from './side-effects/side-effects.module';
import { HealthAlertsModule } from './health-alerts/health-alerts.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { BookingModule } from './booking/booking.module';
import { CareTeamModule } from './care-team/care-team.module';
import { DeviceReadingsModule } from './device-readings/device-readings.module';
import { TrendsModule } from './trends/trends.module';
import { LabsModule } from './labs/labs.module';
import { InsightsModule } from './insights/insights.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PostHogModule,
    LangfuseModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Vercel's serverless filesystem is read-only at runtime — writing to
      // src/schema.gql (fine for local dev, where it's regenerated and
      // committed) would crash on boot there. `true` keeps the schema
      // in-memory only, which is all a running deployment needs.
      autoSchemaFile: process.env.VERCEL ? true : join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      // Narrows what the pharmacy partner can read through the records an order links to (see the guard).
      buildSchemaOptions: { fieldMiddleware: [providerFieldGuard] },
      // Every error leaves with a code, a severity and a message that is safe to show (see common/errors).
      formatError: formatGraphQLError,
      // graphql-ws needs a persistent connection a serverless function
      // can't hold open. Subscriptions are local-dev only until this runs
      // somewhere with a long-lived process.
      subscriptions: process.env.VERCEL ? undefined : { 'graphql-ws': true },
      // Over graphql-ws there is no HTTP request: clients send their token in
      // connectionParams instead, so shape it like one for GqlAuthGuard/passport.
      context: ({ req, connectionParams }: { req?: any; connectionParams?: Record<string, unknown> }) =>
        req ? { req } : { req: { headers: { authorization: connectionParams?.authorization } } },
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CliniciansModule,
    PatientsModule,
    ConsultationsModule,
    PrescriptionsModule,
    CatalogModule,
    QuestionnairesModule,
    ConsentsModule,
    MessagingModule,
    LeadsModule,
    ReferralsModule,
    StripeModule,
    PushModule,
    CouriersModule,
    CheckoutModule,
    EmailModule,
    NotifierModule,
    NotificationsModule,
    DashboardModule,
    UploadsModule,
    OnboardingModule,
    IdentityVerificationModule,
    CheckInsModule,
    WeightJourneyModule,
    DosingModule,
    SymptomsModule,
    SideEffectsModule,
    HealthAlertsModule,
    AppointmentsModule,
    BookingModule,
    CareTeamModule,
    DeviceReadingsModule,
    TrendsModule,
    LabsModule,
    InsightsModule,
  ],
})
export class AppModule {}
