'use client';

import { useEffect } from 'react';
import { captureReferralCode } from '@/lib/referral';

export default function ReferralCapture() {
  useEffect(() => captureReferralCode(), []);
  return null;
}
