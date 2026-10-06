'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { MY_ONBOARDING } from '@/graphql/onboarding';
import { BodyPhotoFlow, fileIdOfUrl } from '@/components/onboarding/BodyPhotoFlow';

/** Opens at the photo that is still missing: each photo is saved the moment it passes, so nothing is lost by leaving. */
export default function BodyPhotoStepPage() {
  const router = useRouter();
  const { data, loading } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const o = data?.myOnboarding;

  if (loading || !o) return <p className="text-sm text-slate-400 text-center py-12">Loading…</p>;

  // A photo saved without ever passing the check (before checking was on, or while it was down) is asked for again.
  const retake: Array<'FRONT' | 'SIDE'> = o.bodyPhotosToRetake ?? [];
  return (
    <BodyPhotoFlow
      initial={{ FRONT: retake.includes('FRONT') ? null : fileIdOfUrl(o.bodyPhotoFrontUrl), SIDE: retake.includes('SIDE') ? null : fileIdOfUrl(o.bodyPhotoSideUrl) }}
      retake={retake}
      onFinished={() => router.push('/onboarding')}
      onExit={() => router.push('/onboarding')}
    />
  );
}
