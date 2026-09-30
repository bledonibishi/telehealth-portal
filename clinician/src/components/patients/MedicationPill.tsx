import { medicationStyle } from '@/lib/medication';

export default function MedicationPill({ label, dose, size = 'sm', solid = false }: {
  label: string; dose?: string | null; size?: 'sm' | 'md'; solid?: boolean;
}) {
  const style = medicationStyle(label);
  const pad = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs';
  if (solid) {
    return (
      <span className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${pad} ${style.solid}`}>
        {label}{dose && <span className="font-normal opacity-90">&nbsp;{dose}</span>}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap ${pad} ${style.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {label}
      {dose && <span className="font-normal opacity-75">· {dose}</span>}
    </span>
  );
}
