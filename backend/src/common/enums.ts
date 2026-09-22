import { registerEnumType } from '@nestjs/graphql';
import {
  ConsultationStatus,
  ConsultationKind,
  UserRole,
  RedFlagSeverity,
} from '@telehealth/shared-types';

registerEnumType(ConsultationStatus, { name: 'ConsultationStatus' });
registerEnumType(ConsultationKind, { name: 'ConsultationKind' });
registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(RedFlagSeverity, { name: 'RedFlagSeverity' });

export { ConsultationStatus, ConsultationKind, UserRole, RedFlagSeverity };
