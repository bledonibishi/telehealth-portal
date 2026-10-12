import { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { ThrottlerException, minutes } from '@nestjs/throttler';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AuthResolver } from '../auth.resolver';
import { ACCOUNT_THROTTLER, GqlThrottlerGuard, RefundSuccessfulAttemptInterceptor } from './gql-throttler.guard';

class FakeStorage {
  hits = new Map<string, number>();

  async increment(key: string, _ttl: number, limit: number) {
    const totalHits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, totalHits);
    const isBlocked = totalHits > limit;
    return { totalHits, timeToExpire: 900, isBlocked, timeToBlockExpire: isBlocked ? 900 : 0 };
  }

  async decrement(key: string) {
    this.hits.set(key, Math.max(0, (this.hits.get(key) ?? 0) - 1));
  }
}

type Mutation = 'loginClinician' | 'loginPatient' | 'verifyMfa' | 'acceptClinicianInvite';

describe('GqlThrottlerGuard', () => {
  let storage: FakeStorage;
  let guard: GqlThrottlerGuard;
  let interceptor: RefundSuccessfulAttemptInterceptor;

  beforeEach(async () => {
    storage = new FakeStorage();
    const options = {
      throttlers: [
        { name: 'ip', ttl: minutes(15), limit: 20 },
        { name: ACCOUNT_THROTTLER, ttl: minutes(15), limit: 5 },
      ],
    };
    // Pending tokens in these tests are "<clinicianId>:<nonce>"; "forged" fails verification
    const jwtService = {
      verify: (token: string) => {
        if (token.startsWith('forged')) throw new Error('invalid signature');
        return { sub: token.split(':')[0] };
      },
    };
    guard = new GqlThrottlerGuard(options, storage as any, new Reflector(), jwtService as any);
    await guard.onModuleInit();
    interceptor = new RefundSuccessfulAttemptInterceptor(storage as any);
  });

  async function attempt(mutation: Mutation, args: Record<string, unknown>, succeeds: boolean) {
    const req = { ip: '198.51.100.1', headers: {}, res: { header: jest.fn() } };
    const context = new ExecutionContextHost([{}, args, { req }, {}], AuthResolver, AuthResolver.prototype[mutation]);
    context.setType('graphql');
    try {
      await guard.canActivate(context as ExecutionContext);
    } catch (err) {
      if (err instanceof ThrottlerException) return 'throttled';
      throw err;
    }
    const handler = { handle: () => (succeeds ? of('ok') : throwError(() => new Error('Invalid credentials'))) };
    return lastValueFrom(interceptor.intercept(context as ExecutionContext, handler)).then(
      () => 'ok',
      () => 'failed',
    );
  }

  it.each<Mutation>(['loginClinician', 'loginPatient', 'verifyMfa'])('throttles %s', (mutation) => {
    const handler = AuthResolver.prototype[mutation];
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(GqlThrottlerGuard);
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toContain(RefundSuccessfulAttemptInterceptor);
  });

  it('never locks out a patient who logs in successfully', async () => {
    const input = { email: 'pat@example.com', password: 'correct' };
    for (let i = 0; i < 10; i++) {
      expect(await attempt('loginPatient', { input }, true)).toBe('ok');
    }
  });

  it('blocks the 6th failed login for an account, even after successful logins', async () => {
    const input = { email: 'pat@example.com', password: 'wrong' };
    await attempt('loginPatient', { input }, true);
    for (let i = 0; i < 5; i++) {
      expect(await attempt('loginPatient', { input }, false)).toBe('failed');
    }
    expect(await attempt('loginPatient', { input: { ...input, email: ' PAT@example.com ' } }, true)).toBe('throttled');
  });

  it('blocks the 6th wrong TOTP code for a clinician, even across new MFA sessions', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await attempt('verifyMfa', { pendingToken: `clinician-1:${i}`, totpCode: '000000' }, false)).toBe('failed');
    }
    expect(await attempt('verifyMfa', { pendingToken: 'clinician-1:new', totpCode: '123456' }, true)).toBe('throttled');
    expect(await attempt('verifyMfa', { pendingToken: 'clinician-2:a', totpCode: '123456' }, true)).toBe('ok');
  });

  it('counts invitation links one by one: bad attempts on some links do not lock out a clinician using their own', async () => {
    for (let i = 0; i < 6; i++) {
      await attempt('acceptClinicianInvite', { token: `guess-${i}`, password: 'a-long-enough-password' }, false);
    }
    expect(await attempt('acceptClinicianInvite', { token: 'their-real-link', password: 'a-long-enough-password' }, true)).toBe('ok');
    // The same link tried over and over is still stopped.
    for (let i = 0; i < 5; i++) await attempt('acceptClinicianInvite', { token: 'one-link', password: `guess-number-${i}` }, false);
    expect(await attempt('acceptClinicianInvite', { token: 'one-link', password: 'a-long-enough-password' }, true)).toBe('throttled');
  });

  it('does not count a forged pending token against the clinician it names', async () => {
    for (let i = 0; i < 6; i++) {
      await attempt('verifyMfa', { pendingToken: 'forged', totpCode: '000000' }, false);
    }
    expect(await attempt('verifyMfa', { pendingToken: 'clinician-1:a', totpCode: '123456' }, true)).toBe('ok');
  });
});
