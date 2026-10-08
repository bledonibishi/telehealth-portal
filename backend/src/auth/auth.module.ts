import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, minutes } from '@nestjs/throttler';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { EmailVerificationService } from './email-verification.service';
import { EmailVerificationResolver } from './email-verification.resolver';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNT_THROTTLER } from './guards/gql-throttler.guard';
import { PrismaThrottlerStorage } from './guards/prisma-throttler.storage';

@Module({
  imports: [
    PassportModule,
    AuditModule,
    EmailModule,
    ThrottlerModule.forRootAsync({
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService) => ({
        errorMessage: 'Too many login attempts. Try again later.',
        storage: new PrismaThrottlerStorage(prisma),
        // Local switch to turn the login limits off; ignored in production
        skipIf: () =>
          config.get<string>('DISABLE_LOGIN_THROTTLE') === 'true' && config.get<string>('NODE_ENV') !== 'production',
        throttlers: [
          { name: 'ip', ttl: minutes(15), limit: 20 },
          { name: ACCOUNT_THROTTLER, ttl: minutes(15), limit: 5 },
        ],
      }),
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRY', '15m') },
      }),
    }),
  ],
  providers: [AuthService, AuthResolver, JwtStrategy, EmailVerificationService, EmailVerificationResolver],
  exports: [AuthService, JwtModule, EmailVerificationService],
})
export class AuthModule {}
