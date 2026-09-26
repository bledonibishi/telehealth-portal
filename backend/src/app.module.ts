import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PostHogModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      subscriptions: { 'graphql-ws': true },
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
  ],
})
export class AppModule {}
