import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CliniciansModule } from './clinicians/clinicians.module';
import { PatientsModule } from './patients/patients.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { MessagingModule } from './messaging/messaging.module';
import { LeadsModule } from './leads/leads.module';
import { StripeModule } from './stripe/stripe.module';
import { EmailModule } from './email/email.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PostHogModule } from './posthog/posthog.module';
import { UploadsModule } from './uploads/uploads.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { CheckInsModule } from './check-ins/check-ins.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PostHogModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Vercel's serverless filesystem is read-only at runtime — writing to
      // src/schema.gql (fine for local dev, where it's regenerated and
      // committed) would crash on boot there. `true` keeps the schema
      // in-memory only, which is all a running deployment needs.
      autoSchemaFile: process.env.VERCEL ? true : join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      // graphql-ws needs a persistent connection a serverless function
      // can't hold open. Subscriptions are local-dev only until this runs
      // somewhere with a long-lived process.
      subscriptions: process.env.VERCEL ? undefined : { 'graphql-ws': true },
      context: ({ req }) => ({ req }),
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    CliniciansModule,
    PatientsModule,
    ConsultationsModule,
    PrescriptionsModule,
    MessagingModule,
    LeadsModule,
    StripeModule,
    EmailModule,
    NotificationsModule,
    DashboardModule,
    UploadsModule,
    OnboardingModule,
    CheckInsModule,
  ],
})
export class AppModule {}
