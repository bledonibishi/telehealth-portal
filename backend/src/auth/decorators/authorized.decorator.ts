import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AccessRole, ROLES_KEY } from '../access-roles';
import { GqlAuthGuard } from '../guards/gql-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

/** Requires a valid access token whose holder has one of `roles`. */
export function Authorized(...roles: AccessRole[]) {
  return applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(GqlAuthGuard, RolesGuard));
}
