// What makes a full-body onboarding photo usable, as plain rules. The vision model only DESCRIBES the photo
// (how many people, is the face visible, …); what that means for the patient — pass, or what to fix — is
// decided here, so the rules can be read, tested and changed without touching a prompt.

export type BodyPhotoView = 'FRONT' | 'SIDE';
export type PhotoCheckOutcome = 'PASS' | 'FAIL' | 'UNCHECKED';

/** What the model reports about one photo. */
export interface PhotoObservation {
  /** People in the picture who are clearly the subject. */
  personCount: number;
  faceVisible: boolean;
  /** The whole body from the top of the head to the feet is in the frame. */
  headToToeVisible: boolean;
  pose: 'front' | 'side' | 'back' | 'other' | 'unclear';
  /** A hoodie, coat, jacket, or loose clothing that hides the shape of the body. */
  bulkyOrBaggyClothing: boolean;
  quality: 'good' | 'poor';
  /** A picture of a screen, a printed photo, a drawing or a cartoon. */
  notARealPhoto: boolean;
  /** The body fills too little of the photo to judge (measured by the pose model; a vision model leaves it out). */
  tooFar?: boolean;
}

export type PhotoIssue =
  | 'NO_PERSON'
  | 'MULTIPLE_PEOPLE'
  | 'FACE_NOT_VISIBLE'
  | 'NOT_FULL_BODY'
  | 'TOO_FAR'
  | 'BAGGY_CLOTHING'
  | 'WRONG_ANGLE'
  | 'POOR_QUALITY'
  | 'NOT_A_REAL_PHOTO';

/** What the patient is told for each issue — fixed wording, never text the model wrote. */
export const ISSUE_MESSAGE: Record<PhotoIssue, string> = {
  NO_PERSON: 'No person visible in the image',
  MULTIPLE_PEOPLE: 'More than one person is in the photo — only you should be in it',
  FACE_NOT_VISIBLE: 'Your face isn’t clearly visible',
  NOT_FULL_BODY: 'Your full body isn’t visible — we need to see you from head to toe',
  TOO_FAR: 'You’re a bit far away — step closer so your whole body fills the outline',
  BAGGY_CLOTHING: 'Baggy or heavy clothing hides your body shape — try fitted clothing, no hoodie or coat',
  WRONG_ANGLE: 'This doesn’t look like the right angle for this photo',
  POOR_QUALITY: 'The photo is too dark or blurry to check',
  NOT_A_REAL_PHOTO: 'This looks like a picture of a screen or a printed image — please take a new photo of yourself',
};

const ANGLE_MESSAGE: Record<BodyPhotoView, string> = {
  FRONT: 'Stand facing the camera, arms relaxed at your sides',
  SIDE: 'Turn so your side faces the camera, with your head turned to look ahead',
};

/** Every reason this photo can't be used for the view asked for, most fundamental first. Empty = it can. */
export function issuesFor(view: BodyPhotoView, o: PhotoObservation): PhotoIssue[] {
  // A picture of a screen or drawing, or with nobody in it, makes every other observation meaningless.
  if (o.notARealPhoto) return ['NOT_A_REAL_PHOTO'];
  if (o.personCount === 0) return ['NO_PERSON'];
  if (o.quality === 'poor') return ['POOR_QUALITY'];

  const issues: PhotoIssue[] = [];
  if (o.personCount > 1) issues.push('MULTIPLE_PEOPLE');
  if (!o.headToToeVisible) issues.push('NOT_FULL_BODY');
  else if (o.tooFar) issues.push('TOO_FAR');
  // Seen from the side, the face is in profile: the head just has to be in the frame.
  if (view === 'FRONT' && !o.faceVisible) issues.push('FACE_NOT_VISIBLE');
  if (o.bulkyOrBaggyClothing) issues.push('BAGGY_CLOTHING');
  if (view === 'FRONT' ? o.pose !== 'front' && o.pose !== 'unclear' : o.pose !== 'side' && o.pose !== 'unclear') issues.push('WRONG_ANGLE');
  return issues;
}

/** The sentence under an issue that needs a how-to rather than just a complaint. */
export const messageFor = (issue: PhotoIssue, view: BodyPhotoView) => (issue === 'WRONG_ANGLE' ? `${ISSUE_MESSAGE.WRONG_ANGLE}. ${ANGLE_MESSAGE[view]}` : ISSUE_MESSAGE[issue]);

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** What the model API can read, from the file's own first bytes. HEIC and anything else: null (not checked). */
export function imageTypeOf(buf: Buffer): ImageType | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

const POSES = ['front', 'side', 'back', 'other', 'unclear'] as const;

/** The model's tool input, or null when it isn't what was asked for (a malformed answer is "not checked", never a guess). */
export function parseObservation(raw: unknown): PhotoObservation | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const count = Number(r.person_count);
  if (!Number.isInteger(count) || count < 0 || count > 20) return null;
  if (typeof r.face_visible !== 'boolean' || typeof r.head_to_toe_visible !== 'boolean') return null;
  if (typeof r.bulky_or_baggy_clothing !== 'boolean' || typeof r.not_a_real_photo !== 'boolean') return null;
  if (!POSES.includes(r.pose as any) || (r.quality !== 'good' && r.quality !== 'poor')) return null;
  return {
    personCount: count,
    faceVisible: r.face_visible,
    headToToeVisible: r.head_to_toe_visible,
    pose: r.pose as PhotoObservation['pose'],
    bulkyOrBaggyClothing: r.bulky_or_baggy_clothing,
    quality: r.quality,
    notARealPhoto: r.not_a_real_photo,
  };
}
