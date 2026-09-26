import { Injectable } from '@nestjs/common';
import { PhotoReviewStatus } from '../common/enums';

/**
 * Placeholder for automated body-photo compliance checks (face visible, full
 * body visible, appropriate clothing). No AI check is wired up yet — every
 * submission is simply queued for manual clinician review.
 */
@Injectable()
export class PhotoReviewService {
  async review(_patientId: string, _frontFileId: string, _sideFileId: string): Promise<PhotoReviewStatus> {
    // TODO: replace with a real vision-model compliance check.
    return PhotoReviewStatus.PENDING_REVIEW;
  }
}
