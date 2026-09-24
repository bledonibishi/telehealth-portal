import { registerEnumType } from '@nestjs/graphql';
import {
  ConsultationStatus,
  ConsultationKind,
  UserRole,
  RedFlagSeverity,
  ClinicianRole,
} from '@telehealth/shared-types';

registerEnumType(ConsultationStatus, { name: 'ConsultationStatus' });
registerEnumType(ConsultationKind, { name: 'ConsultationKind' });
registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(RedFlagSeverity, { name: 'RedFlagSeverity' });
registerEnumType(ClinicianRole, { name: 'ClinicianRole' });

export { ConsultationStatus, ConsultationKind, UserRole, RedFlagSeverity, ClinicianRole };
