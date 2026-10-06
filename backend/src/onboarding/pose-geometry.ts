import type { PhotoObservation } from './photo-check';

// Turning a YOLO pose model's raw output into "what is in the photo". Pure number-crunching on keypoints, so
// every rule can be tested without a model: pose-detector.ts runs the model, this decides what it means.

/** COCO keypoint order, as every Ultralytics pose model outputs it. */
export const KP = { nose: 0, lEye: 1, rEye: 2, lEar: 3, rEar: 4, lShoulder: 5, rShoulder: 6, lHip: 11, rHip: 12, lKnee: 13, rKnee: 14, lAnkle: 15, rAnkle: 16 } as const;

export interface Keypoint { x: number; y: number; c: number }
export interface Box { x1: number; y1: number; x2: number; y2: number }
export interface Person { confidence: number; box: Box; keypoints: Keypoint[] }

export const INPUT_SIZE = 640;
export const MIN_DETECTION = 0.25;

/** How an image is fitted into the model's square input: scaled to fit, centred, padded. */
export function letterbox(width: number, height: number, size = INPUT_SIZE) {
  const scale = Math.min(size / width, size / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const padX = Math.floor((size - w) / 2);
  const padY = Math.floor((size - h) / 2);
  return { scale, w, h, padX, padY, size };
}

const area = (b: Box) => Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
function iou(a: Box, b: Box) {
  const inter = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return inter / (area(a) + area(b) - inter || 1);
}

/** Keeps the best detection of each person: overlapping boxes are the same person seen twice. */
export function nms(people: Person[], threshold = 0.45): Person[] {
  const kept: Person[] = [];
  for (const p of [...people].sort((a, b) => b.confidence - a.confidence)) if (kept.every((k) => iou(k.box, p.box) < threshold)) kept.push(p);
  return kept;
}

/**
 * Reads the model output `[1, 56, N]` (channel-major: box cx, cy, w, h, confidence, then 17 × x, y, visibility)
 * back into the original image's coordinates.
 */
export function decode(output: ArrayLike<number>, n: number, lb: ReturnType<typeof letterbox>, minConfidence = MIN_DETECTION): Person[] {
  const people: Person[] = [];
  const at = (channel: number, i: number) => output[channel * n + i];
  for (let i = 0; i < n; i++) {
    const confidence = at(4, i);
    if (confidence < minConfidence) continue;
    const cx = at(0, i), cy = at(1, i), w = at(2, i), h = at(3, i);
    const toX = (x: number) => (x - lb.padX) / lb.scale;
    const toY = (y: number) => (y - lb.padY) / lb.scale;
    people.push({
      confidence,
      box: { x1: toX(cx - w / 2), y1: toY(cy - h / 2), x2: toX(cx + w / 2), y2: toY(cy + h / 2) },
      keypoints: Array.from({ length: 17 }, (_, k) => ({ x: toX(at(5 + k * 3, i)), y: toY(at(6 + k * 3, i)), c: at(7 + k * 3, i) })),
    });
  }
  return nms(people);
}

// ── What the keypoints say about the photo ─────────────────────────────────────────────────────────────────────
// Thresholds were set against real photos: full-length fronts and sides, upper-body crops (ankles ~0), a person
// from behind (nose ~0.2), and a frame that cuts the feet off (box touching the bottom edge).

/** A person has to be this sure to count; a faint detection in the background is not a second person. */
export const PERSON_CONFIDENCE = 0.5;
/** A second person only counts if they are at least this tall compared to the first. */
export const SECOND_PERSON_MIN_HEIGHT = 0.4;
export const VISIBLE = 0.5;
/**
 * Room needed beyond the keypoints, as a share of the nose-to-ankle distance: a head reaches ~0.1 above the nose and
 * a foot ~0.08 below the ankle, so less room than this means the head or the feet are cut off by the frame. (The
 * person's box is no use for this: a tight studio shot has the box within 1% of the edge with nothing cut off.)
 */
export const HEAD_ROOM = 0.06;
export const FOOT_ROOM = 0.04;
/** Standing further back than this makes the body too small to judge (share of the photo's height). */
export const MIN_BODY_HEIGHT = 0.55;
/** Shoulder width / torso length: ~0.5–0.7 facing the camera, ~0.1 from the side. */
export const FRONT_RATIO = 0.35;
export const SIDE_RATIO = 0.28;

/** Everything the rules need to know about the main person, or null when nobody (sure enough) is there. */
export function observe(people: Person[], width: number, height: number): PhotoObservation {
  const sure = people.filter((p) => p.confidence >= PERSON_CONFIDENCE);
  const none: PhotoObservation = { personCount: 0, faceVisible: false, headToToeVisible: false, pose: 'unclear', bulkyOrBaggyClothing: false, quality: 'good', notARealPhoto: false, tooFar: false };
  if (!sure.length) return none;

  const main = [...sure].sort((a, b) => area(b.box) - area(a.box))[0];
  const mainHeight = main.box.y2 - main.box.y1;
  const others = sure.filter((p) => p !== main && p.confidence >= 0.6 && p.box.y2 - p.box.y1 >= SECOND_PERSON_MIN_HEIGHT * mainHeight);

  const k = main.keypoints;
  const seen = (i: number, min = VISIBLE) => k[i].c >= min;

  const faceVisible = seen(KP.nose) && (seen(KP.lEye, 0.4) || seen(KP.rEye, 0.4));
  const feet = Math.max(k[KP.lAnkle].c, k[KP.rAnkle].c) >= VISIBLE;
  const headSeen = seen(KP.nose) || seen(KP.lEar) || seen(KP.rEar);
  const ankles = [KP.lAnkle, KP.rAnkle].filter((i) => seen(i));
  const span = ankles.length && seen(KP.nose) ? Math.max(...ankles.map((i) => k[i].y)) - k[KP.nose].y : 0;
  const insideFrame = span > 0 && k[KP.nose].y >= HEAD_ROOM * span && height - Math.max(...ankles.map((i) => k[i].y)) >= FOOT_ROOM * span;
  const headToToeVisible = headSeen && feet && insideFrame;
  const tooFar = mainHeight / height < MIN_BODY_HEIGHT;

  // Facing or turned away: how wide the shoulders look against the length of the torso.
  let pose: PhotoObservation['pose'] = 'unclear';
  if (seen(KP.lShoulder) && seen(KP.rShoulder) && seen(KP.lHip) && seen(KP.rHip)) {
    const shoulders = Math.abs(k[KP.lShoulder].x - k[KP.rShoulder].x);
    const torso = Math.hypot((k[KP.lShoulder].x + k[KP.rShoulder].x) / 2 - (k[KP.lHip].x + k[KP.rHip].x) / 2, (k[KP.lShoulder].y + k[KP.rShoulder].y) / 2 - (k[KP.lHip].y + k[KP.rHip].y) / 2);
    const ratio = torso > 0 ? shoulders / torso : 0;
    if (ratio >= FRONT_RATIO) pose = !seen(KP.nose, 0.3) && !seen(KP.lEye, 0.3) && !seen(KP.rEye, 0.3) ? 'back' : 'front';
    else if (ratio <= SIDE_RATIO) pose = 'side';
  }

  return {
    personCount: 1 + others.length,
    faceVisible,
    headToToeVisible,
    pose,
    // A pose model sees the skeleton, not the clothes: the clothing fields are left to a second opinion (or the clinician).
    bulkyOrBaggyClothing: false,
    quality: 'good',
    notARealPhoto: false,
    tooFar,
  };
}
