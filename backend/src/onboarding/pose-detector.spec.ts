import { orientedSize } from './pose-detector';

describe('orientedSize', () => {
  it('keeps the size of an upright photo', () => {
    expect(orientedSize({ width: 3000, height: 4000 })).toEqual({ width: 3000, height: 4000 });
    expect(orientedSize({ width: 3000, height: 4000, orientation: 1 })).toEqual({ width: 3000, height: 4000 });
    expect(orientedSize({ width: 3000, height: 4000, orientation: 3 })).toEqual({ width: 3000, height: 4000 });
  });

  it('turns the size around for a portrait phone photo stored sideways (EXIF orientation 5 to 8)', () => {
    for (const orientation of [5, 6, 7, 8]) {
      expect(orientedSize({ width: 4000, height: 3000, orientation })).toEqual({ width: 3000, height: 4000 });
    }
  });
});
