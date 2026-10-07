import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IdentityVerificationController } from './identity-verification.controller';
import { IdentityVerificationResolver } from './identity-verification.resolver';
import { IdentityVerificationService } from './identity-verification.service';
import { VerifyClient } from './verify-client.service';

@Module({
  imports: [PrismaModule],
  controllers: [IdentityVerificationController],
  providers: [IdentityVerificationService, IdentityVerificationResolver, VerifyClient],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
