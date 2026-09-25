import { Injectable, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthFailureReason, authFailure, authFailureReason } from '../auth-failure';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(GqlAuthGuard.name);

  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext().req;
  }

  // Passport reports expected auth failures through `info`. Nest's default turns them into
  // a bare UnauthorizedException, so give each one a reason and log it as a warning.
  handleRequest<TUser = any>(err: any, user: any, info: any, context: ExecutionContext): TUser {
    if (err && !(err instanceof UnauthorizedException)) throw err;
    if (user && !err) return user;

    const failure: UnauthorizedException = err ?? authFailure(reasonFromPassportInfo(info));
    const operation = GqlExecutionContext.create(context).getInfo()?.fieldName ?? 'request';
    this.logger.warn(`Rejected ${operation}: ${authFailureReason(failure)}`);
    throw failure;
  }
}

function reasonFromPassportInfo(info: any): AuthFailureReason {
  if (info?.name === 'TokenExpiredError') return AuthFailureReason.TOKEN_EXPIRED;
  if (info?.message === 'No auth token') return AuthFailureReason.TOKEN_MISSING;
  return AuthFailureReason.TOKEN_INVALID;
}
