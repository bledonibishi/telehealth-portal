import { type Person, observe } from './pose-geometry';

// Keypoints in the COCO order: nose, eyes, ears, shoulders, elbows, wrists, hips, knees, ankles.
const kp = (nose: number[], ankle: number[], c = 0.95) =>
  Array.from({ length: 17 }, (_, i) => {
    const [x, y] = i === 0 ? nose : i >= 15 ? ankle : [240, nose[1] + (ankle[1] - nose[1]) * (i / 17)];
    return { x: i % 2 ? x - 30 : x + 30 * (i ? 1 : 0), y, c };
  });
const person = (nose: number[], ankle: number[], box: [number, number, number, number], c = 0.95): Person => ({
  confidence: 0.94,
  box: { x1: box[0], y1: box[1], x2: box[2], y2: box[3] },
  keypoints: kp(nose, ankle, c),
});

describe('observe: is the whole body in the frame?', () => {
  it('accepts a tight head-to-toe shot whose box is within 1% of the top and bottom edges (a studio cut-out)', () => {
    // A 482x1217 photo: head 1.3% from the top, bare feet 1% from the bottom, ankles with room for the feet.
    const seen = observe([person([245, 132], [294, 1115], [47, 16, 432, 1205])], 482, 1217);
    expect(seen.headToToeVisible).toBe(true);
  });

  it('rejects a frame that cuts the feet off: the ankles are at the bottom edge', () => {
    expect(observe([person([245, 132], [294, 1205], [47, 16, 432, 1217])], 482, 1217).headToToeVisible).toBe(false);
  });

  it('rejects a frame that cuts the top of the head off: the nose is at the top edge', () => {
    expect(observe([person([245, 20], [294, 1100], [47, 0, 432, 1190])], 482, 1217).headToToeVisible).toBe(false);
  });

  it('rejects an upper-body crop: the ankles are not seen', () => {
    expect(observe([person([245, 132], [294, 1100], [47, 16, 432, 1217], 0.1)], 482, 1217).headToToeVisible).toBe(false);
  });

  it('rejects a photo where one foot is in the frame and the other is cut off', () => {
    const lone = person([245, 132], [294, 1115], [47, 16, 432, 1205]);
    lone.keypoints[16] = { ...lone.keypoints[16], c: 0.04 }; // the right ankle is out of the frame
    expect(observe([lone], 482, 1217).headToToeVisible).toBe(false);
  });

  it('accepts a side view where the far foot is hidden behind the near one, as long as it still shows a sign of being there', () => {
    const side = person([245, 132], [294, 1115], [47, 16, 432, 1205]);
    side.keypoints[16] = { ...side.keypoints[16], c: 0.4 };
    expect(observe([side], 482, 1217).headToToeVisible).toBe(true);
  });
});
