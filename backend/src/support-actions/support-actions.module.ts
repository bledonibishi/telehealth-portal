import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { StripeModule } from '../stripe/stripe.module';
import { SupportActionsService } from './support-actions.service';
import { SupportActionsResolver } from './support-actions.resolver';

@Module({
  imports: [PrismaModule, AuthModule, StripeModule],
  providers: [SupportActionsService, SupportActionsResolver],
})
export class SupportActionsModule {}
