import { Injectable, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    const req = GqlExecutionContext.create(context).getContext().req;
    return { req, res: req.res };
  }
}

// Tracks the account under attack, so rotating IPs does not reset the limit
export function accountTracker(_req: Record<string, any>, context: ExecutionContext) {
  const args = GqlExecutionContext.create(context).getArgs();
  return args.input?.email ? args.input.email.trim().toLowerCase() : args.pendingToken;
}
