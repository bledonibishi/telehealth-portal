'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@apollo/client';
import { GET_TICKET } from '@/graphql/tickets';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { ErrorAlert } from '@/components/ui/Alert';
import { LoadingState } from '@telehealth/loading';
import TicketDetail from '@/components/tickets/TicketDetail';
import DoctorTicketView from '@/components/tickets/DoctorTicketView';
import { getCurrentRole } from '@/lib/role';

export default function TicketPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useQuery(GET_TICKET, { variables: { id }, pollInterval: 15_000 });

  if (loading && !data) return <div className="p-6"><LoadingState /></div>;
  if (error || !data?.ticket) {
    return (
      <div className="px-4 sm:px-6 py-5 max-w-6xl mx-auto space-y-3">
        <Link href="/tickets" className="text-sm text-gray-500 hover:text-gray-800">← {t('All tickets')}</Link>
        <ErrorAlert error={error ?? 'That ticket doesn’t exist, or isn’t yours to see.'} />
      </div>
    );
  }
  return getCurrentRole() === 'DOCTOR' ? <DoctorTicketView ticket={data.ticket} /> : <TicketDetail ticket={data.ticket} />;
}
