import { ConsultationDetail } from '@/components/consultation/ConsultationDetail';

export default function ConsultationPage({ params }: { params: { id: string } }) {
  return <ConsultationDetail id={params.id} />;
}
