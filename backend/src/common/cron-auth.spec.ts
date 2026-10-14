import { UnauthorizedException } from '@nestjs/common';
import { assertCronAuth } from './cron-auth';

describe('assertCronAuth', () => {
  it('lets the configured bearer token through', () => {
    expect(() => assertCronAuth('Bearer secret', 'secret')).not.toThrow();
  });

  it('refuses a wrong token, a token of another length, and a missing header', () => {
    expect(() => assertCronAuth('Bearer wrong!', 'secret')).toThrow(UnauthorizedException);
    expect(() => assertCronAuth('Bearer secret-and-more', 'secret')).toThrow(UnauthorizedException);
    expect(() => assertCronAuth('secret', 'secret')).toThrow(UnauthorizedException);
    expect(() => assertCronAuth(undefined, 'secret')).toThrow(UnauthorizedException);
  });

  it('refuses everything while no secret is configured', () => {
    expect(() => assertCronAuth('Bearer ', undefined)).toThrow(UnauthorizedException);
    expect(() => assertCronAuth('Bearer undefined', undefined)).toThrow(UnauthorizedException);
    expect(() => assertCronAuth(undefined, '')).toThrow(UnauthorizedException);
  });
});
