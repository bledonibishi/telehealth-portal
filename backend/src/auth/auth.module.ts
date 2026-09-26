import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, minutes } from '@nestjs/throttler';
import { AuditModule } from '../audit/audit.module';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { JwtStrategy } from './strategies/jwt.strategy';
import { accountTracker } from './guards/gql-throttler.guard';

@Module({
  imports: [
    PassportModule,
    AuditModule,
    ThrottlerModule.forRoot({
      errorMessage: 'Too many login attempts. Try again later.',
      throttlers: [
        { name: 'ip', ttl: minutes(15), limit: 20 },
        { name: 'account', ttl: minutes(15), limit: 5, getTracker: accountTracker },
      ],
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
  providers: [AuthService, AuthResolver, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
