import { type PhotoObservation, imageTypeOf, issuesFor, messageFor, parseObservation } from './photo-check';

const good = (over: Partial<PhotoObservation> = {}): PhotoObservation => ({
  personCount: 1, faceVisible: true, headToToeVisible: true, pose: 'front', bulkyOrBaggyClothing: false, quality: 'good', notARealPhoto: false, ...over,
});

describe('issuesFor', () => {
  it('passes a clear, fitted, full-length photo facing the camera, and the same turned to the side for the side view', () => {
    expect(issuesFor('FRONT', good())).toEqual([]);
    expect(issuesFor('SIDE', good({ pose: 'side', faceVisible: false }))).toEqual([]);
  });

  it('says when nobody is in the picture, or it is a photo of a screen — and nothing else, since the rest would be guesses', () => {
    expect(issuesFor('FRONT', good({ personCount: 0, headToToeVisible: false, faceVisible: false }))).toEqual(['NO_PERSON']);
    expect(issuesFor('FRONT', good({ notARealPhoto: true, personCount: 0 }))).toEqual(['NOT_A_REAL_PHOTO']);
    expect(issuesFor('FRONT', good({ quality: 'poor', headToToeVisible: false }))).toEqual(['POOR_QUALITY']);
  });

  it('lists every fixable problem at once, so the patient fixes them in one go', () => {
    expect(issuesFor('FRONT', good({ faceVisible: false, headToToeVisible: false, bulkyOrBaggyClothing: true, personCount: 2 }))).toEqual([
      'MULTIPLE_PEOPLE', 'NOT_FULL_BODY', 'FACE_NOT_VISIBLE', 'BAGGY_CLOTHING',
    ]);
  });

  it('wants the face on the front photo but not on the side one, where it is in profile', () => {
    expect(issuesFor('FRONT', good({ faceVisible: false }))).toEqual(['FACE_NOT_VISIBLE']);
    expect(issuesFor('SIDE', good({ pose: 'side', faceVisible: false }))).toEqual([]);
  });

  it('wants the right angle for the view — and gives the benefit of the doubt when the angle is unclear', () => {
    expect(issuesFor('FRONT', good({ pose: 'side' }))).toEqual(['WRONG_ANGLE']);
    expect(issuesFor('FRONT', good({ pose: 'back' }))).toEqual(['WRONG_ANGLE']);
    expect(issuesFor('SIDE', good({ pose: 'front' }))).toEqual(['WRONG_ANGLE']);
    expect(issuesFor('FRONT', good({ pose: 'unclear' }))).toEqual([]);
    expect(issuesFor('SIDE', good({ pose: 'unclear' }))).toEqual([]);
  });

  it('does not fail a photo for the colour of the clothes: only baggy or bulky layers count', () => {
    expect(issuesFor('FRONT', good({ bulkyOrBaggyClothing: false }))).toEqual([]);
  });
});

describe('messageFor', () => {
  it('uses fixed wording, and tells the patient how to stand when the angle is wrong', () => {
    expect(messageFor('NO_PERSON', 'FRONT')).toBe('No person visible in the image');
    expect(messageFor('WRONG_ANGLE', 'SIDE')).toMatch(/side faces the camera/);
    expect(messageFor('WRONG_ANGLE', 'FRONT')).toMatch(/facing the camera/);
  });
});

describe('imageTypeOf', () => {
  it('reads the formats the model API accepts from the first bytes, and nothing else', () => {
    expect(imageTypeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(imageTypeOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    expect(imageTypeOf(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]))).toBe('image/webp');
    expect(imageTypeOf(Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypheic')]))).toBeNull(); // HEIC
    expect(imageTypeOf(Buffer.from('<html>'))).toBeNull();
  });
});

describe('parseObservation', () => {
  const raw = { person_count: 1, face_visible: true, head_to_toe_visible: true, pose: 'front', bulky_or_baggy_clothing: false, quality: 'good', not_a_real_photo: false };
  it('reads a well-formed answer', () => {
    expect(parseObservation(raw)).toEqual(good());
  });
  it('rejects anything malformed rather than guessing', () => {
    expect(parseObservation(null)).toBeNull();
    expect(parseObservation({ ...raw, person_count: 'one' })).toBeNull();
    expect(parseObservation({ ...raw, person_count: -1 })).toBeNull();
    expect(parseObservation({ ...raw, pose: 'upside-down' })).toBeNull();
    expect(parseObservation({ ...raw, face_visible: 'yes' })).toBeNull();
    const { quality, ...missing } = raw;
    expect(parseObservation(missing)).toBeNull();
  });
});
