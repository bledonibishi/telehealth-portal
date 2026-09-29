import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AccessRole, ROLES_KEY, accessRoleOf } from '../access-roles';

// Runs after GqlAuthGuard has put the JWT strategy's user on the request.
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<AccessRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) return true;

    const req =
      context.getType<string>() === 'graphql'
        ? GqlExecutionContext.create(context).getContext().req
        : context.switchToHttp().getRequest();
    const role = accessRoleOf(req?.user);

    if (role && allowed.includes(role)) return true;

    const operation =
      context.getType<string>() === 'graphql'
        ? GqlExecutionContext.create(context).getInfo()?.fieldName
        : context.getHandler().name;
    this.logger.warn(`Forbidden ${operation} for role ${role ?? 'none'}`);
    throw new ForbiddenException('You do not have access to this action');
  }
}
