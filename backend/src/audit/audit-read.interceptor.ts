import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable, from, mergeMap } from 'rxjs';
import { AuditService } from './audit.service';
import { UserRole } from '../common/enums';

const AUDIT_READ_KEY = 'auditRead';

interface AuditReadOptions {
  resourceType: string;
  // Which argument names the record being read.
  idArg: string;
}

/**
 * Records who viewed a patient's health record, not just who changed it.
 * Only successful reads are logged, after the resolver returns.
 */
export function AuditRead(resourceType: string, idArg = 'id') {
  return applyDecorators(
    SetMetadata(AUDIT_READ_KEY, { resourceType, idArg } satisfies AuditReadOptions),
    UseInterceptors(AuditReadInterceptor),
  );
}

@Injectable()
export class AuditReadInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditReadOptions>(AUDIT_READ_KEY, context.getHandler());
    if (!options) return next.handle();

    const gql = context.getType<string>() === 'graphql' ? GqlExecutionContext.create(context) : null;
    const req = gql ? gql.getContext().req : context.switchToHttp().getRequest();
    const args = gql ? gql.getArgs() : req.params;
    const user = req?.user;
    const field = gql ? gql.getInfo().fieldName : context.getHandler().name;

    return next.handle().pipe(
      mergeMap((result) =>
        from(
          (async () => {
            if (user) {
              await this.audit.log({
                actorId: user.id,
                actorRole: user.role as UserRole,
                action: 'RECORD_VIEWED',
                resourceType: options.resourceType,
                resourceId: String(args?.[options.idArg] ?? 'unknown'),
                metadata: { via: field },
              });
            }
            return result;
          })(),
        ),
      ),
    );
  }
}
