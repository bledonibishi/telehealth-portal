import Link from 'next/link';
import { Alert } from '@/components/common/Alert';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-6">
      <Alert tone="info" title="Page not found">We couldn’t find that page. It may have been moved or the link may be out of date.</Alert>
      <Link href="/" className="text-sm font-medium text-ink-600 hover:text-ink-800">Back to home</Link>
    </div>
  );
}
