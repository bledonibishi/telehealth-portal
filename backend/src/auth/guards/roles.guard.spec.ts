import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AccessRole } from '../access-roles';

function httpContext(user: unknown) {
  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('RolesGuard', () => {
  const guardAllowing = (roles: AccessRole[] | undefined) => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(roles) } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('allows when no roles are declared', () => {
    expect(guardAllowing(undefined).canActivate(httpContext(undefined))).toBe(true);
  });

  it('allows a clinician whose clinicianRole is listed', () => {
    const user = { id: 'c1', role: 'CLINICIAN', clinicianRole: 'DOCTOR' };
    expect(guardAllowing(['ADMIN', 'DOCTOR'] as AccessRole[]).canActivate(httpContext(user))).toBe(true);
  });

  it('rejects a clinician whose clinicianRole is not listed', () => {
    const user = { id: 'c1', role: 'CLINICIAN', clinicianRole: 'CX_TEAM' };
    expect(() => guardAllowing(['ADMIN', 'DOCTOR'] as AccessRole[]).canActivate(httpContext(user))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a patient on a staff-only action', () => {
    const user = { id: 'p1', role: 'PATIENT' };
    expect(() => guardAllowing(['ADMIN', 'DOCTOR'] as AccessRole[]).canActivate(httpContext(user))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a patient where PATIENT is listed', () => {
    const user = { id: 'p1', role: 'PATIENT' };
    expect(guardAllowing(['PATIENT']).canActivate(httpContext(user))).toBe(true);
  });

  it('does not treat a bare CLINICIAN role (no clinicianRole) as any staff role', () => {
    const user = { id: 'c1', role: 'CLINICIAN' };
    expect(() => guardAllowing(['ADMIN'] as AccessRole[]).canActivate(httpContext(user))).toThrow(ForbiddenException);
  });
});
