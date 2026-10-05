'use client';

import AppointmentRequests from '@/components/appointments/AppointmentRequests';
import Diary from '@/components/appointments/Diary';
import { useI18n } from '@/lib/i18n/I18nProvider';

export default function AppointmentsPage() {
  const { t } = useI18n();
  return (
    <div>
      <div className="px-6 py-5 border-b border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-900">{t('Appointments')}</h1>
        <p className="text-xs text-gray-500 mt-0.5">{t('Patients asking to see a doctor. Urgent requests must be answered within 24 hours, routine ones within 3 days.')}</p>
      </div>
      <Diary />
      <AppointmentRequests />
    </div>
  );
}
