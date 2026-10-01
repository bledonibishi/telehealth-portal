import {
  Injectable,
  ExecutionContext,
  CallHandler,
  NestInterceptor,
  UseGuards,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerRequest,
} from '@nestjs/throttler';
import { concatMap } from 'rxjs';
import { PrismaThrottlerStorage } from './prisma-throttler.storage';

export const ACCOUNT_THROTTLER = 'account';
const ACCOUNT_THROTTLE_KEY = Symbol('accountThrottleKey');

function gqlRequest(context: ExecutionContext) {
  return GqlExecutionContext.create(context).getContext().req;
}

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: PrismaThrottlerStorage,
    reflector: Reflector,
    private jwtService: JwtService,
  ) {
    super(options, storage, reflector);
  }

  getRequestResponse(context: ExecutionContext) {
    const req = gqlRequest(context);
    return { req, res: req.res };
  }

  protected handleRequest(props: ThrottlerRequest) {
    if (props.throttler.name !== ACCOUNT_THROTTLER) return super.handleRequest(props);
    const req = gqlRequest(props.context);
    return super.handleRequest({
      ...props,
      getTracker: (_req, context) => this.accountTracker(context),
      generateKey: (context, tracker, name) => (req[ACCOUNT_THROTTLE_KEY] = props.generateKey(context, tracker, name)),
    });
  }

  // Tracks the account under attack, so rotating IPs or MFA sessions does not reset the limit
  private accountTracker(context: ExecutionContext): string {
    const args = GqlExecutionContext.create(context).getArgs();
    if (args.input?.email) return args.input.email.trim().toLowerCase();
    if (args.input?.token) return args.input.token;
    try {
      return this.jwtService.verify(args.pendingToken).sub;
    } catch {
      return args.pendingToken;
    }
  }
}

// The account limit counts failed attempts only, so a user who logs in correctly is never locked out
@Injectable()
export class RefundSuccessfulAttemptInterceptor implements NestInterceptor {
  constructor(@InjectThrottlerStorage() private storage: PrismaThrottlerStorage) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const key: string | undefined = gqlRequest(context)[ACCOUNT_THROTTLE_KEY];
    return next.handle().pipe(
      concatMap(async (result) => {
        if (key) await this.storage.decrement(key);
        return result;
      }),
    );
  }
}

export const ThrottleLoginAttempts = () =>
  applyDecorators(UseGuards(GqlThrottlerGuard), UseInterceptors(RefundSuccessfulAttemptInterceptor));
