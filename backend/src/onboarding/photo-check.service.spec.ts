import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DEFAULT_PHOTO_CHECK_MODEL, FAILS_BEFORE_MANUAL_REVIEW, FRAMES_PER_MINUTE, MAX_FRAME_BASE64, PhotoCheckService } from './photo-check.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const answer = (over: Record<string, unknown> = {}) => ({
  content: [{ type: 'tool_use', name: 'describe_photo', input: { person_count: 1, face_visible: true, head_to_toe_visible: true, pose: 'front', bulky_or_baggy_clothing: false, quality: 'good', not_a_real_photo: false, ...over } }],
});

function build(env: Record<string, string | undefined> = { ANTHROPIC_API_KEY: 'sk-test' }) {
  // These specs are about the checking itself; the required / not-required rule has its own block below.
  const prisma: any = {
    bodyPhotoCheck: { create: jest.fn().mockResolvedValue({ id: 'c-1' }), update: jest.fn(), count: jest.fn().mockResolvedValue(0), findFirst: jest.fn() },
  };
  const uploads: any = {
    findOwned: jest.fn().mockResolvedValue({ id: 'f-1', storageKey: 'p-1/f-1' }),
    readContents: jest.fn().mockResolvedValue(JPEG),
  };
  const create = jest.fn().mockResolvedValue(answer());
  const detector = { available: jest.fn().mockResolvedValue(true), detect: jest.fn(), name: 'yolov8n-pose' };
  const config = { PHOTO_CHECK_PROVIDER: 'claude', ...env };
  const service = new PhotoCheckService(prisma, uploads, { get: (k: string) => config[k] } as any, detector as any);
  if (env.ANTHROPIC_API_KEY) service.useClient({ messages: { create } } as any);
  return { service, prisma, uploads, create, detector };
}

describe('PhotoCheckService.check', () => {
  it('sends the photo to the cheapest vision model with a forced tool call, and passes a good one', async () => {
    const { service, prisma, create } = build();
    const r = await service.check('p-1', 'f-1', 'FRONT');
    expect(r).toMatchObject({ outcome: 'PASS', issues: [], messages: [], canSendForReview: false });
    const req = create.mock.calls[0][0];
    expect(req.model).toBe(DEFAULT_PHOTO_CHECK_MODEL);
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'describe_photo' });
    expect(req.messages[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } });
    // Written down before it runs (so concurrent checks count each other), then filled in.
    expect(prisma.bodyPhotoCheck.create).toHaveBeenCalledWith({ data: { patientId: 'p-1', fileId: 'f-1', view: 'FRONT', outcome: 'UNCHECKED', issues: [] } });
    expect(prisma.bodyPhotoCheck.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: { outcome: 'PASS', issues: [], model: DEFAULT_PHOTO_CHECK_MODEL } });
  });

  it('fails a photo with fixed-wording reasons, never text from the model', async () => {
    const { service, create } = build();
    create.mockResolvedValue(answer({ person_count: 0, head_to_toe_visible: false, face_visible: false }));
    const r = await service.check('p-1', 'f-1', 'FRONT');
    expect(r).toMatchObject({ outcome: 'FAIL', issues: ['NO_PERSON'], messages: ['No person visible in the image'] });
  });

  it('offers a clinician’s review only after the patient has failed enough times', async () => {
    const { service, prisma, create } = build();
    create.mockResolvedValue(answer({ pose: 'side' }));
    prisma.bodyPhotoCheck.count.mockImplementation(({ where }: any) => Promise.resolve(where.outcome === 'FAIL' ? FAILS_BEFORE_MANUAL_REVIEW - 1 : 0));
    expect((await service.check('p-1', 'f-1', 'FRONT')).canSendForReview).toBe(false);
    prisma.bodyPhotoCheck.count.mockImplementation(({ where }: any) => Promise.resolve(where.outcome === 'FAIL' ? FAILS_BEFORE_MANUAL_REVIEW : 0));
    expect((await service.check('p-1', 'f-1', 'FRONT')).canSendForReview).toBe(true);
  });

  it('only checks the patient’s own photo of the right kind', async () => {
    const { service, uploads, create } = build();
    uploads.findOwned.mockRejectedValue(new NotFoundException());
    await expect(service.check('p-1', 'someone-elses', 'FRONT')).rejects.toThrow(NotFoundException);
    expect(uploads.findOwned).toHaveBeenCalledWith('p-1', 'someone-elses', ['BODY_PHOTO_FRONT']);
    expect(create).not.toHaveBeenCalled();
  });

  describe('when the check cannot run', () => {
    // Required (the default): the photo is not accepted, and the patient is told why.
    const turnedAway = async (b: ReturnType<typeof build>, message: RegExp) =>
      expect(await b.service.check('p-1', 'f-1', 'FRONT')).toMatchObject({ outcome: 'UNCHECKED', issues: [], messages: [expect.stringMatching(message)], canSendForReview: false });

    it('has no API key', async () => {
      await turnedAway(build({}), /isn’t available right now/);
    });
    it('is over the daily limit', async () => {
      const b = build({ ANTHROPIC_API_KEY: 'k', PHOTO_CHECK_DAILY_LIMIT: '3' });
      b.prisma.bodyPhotoCheck.count.mockResolvedValue(4); // the count includes this very check, written down first
      await turnedAway(b, /tried a lot of photos/);
      expect(b.create).not.toHaveBeenCalled();
    });
    it('is the last check of the day: still allowed, the one after is not', async () => {
      const b = build({ ANTHROPIC_API_KEY: 'k', PHOTO_CHECK_DAILY_LIMIT: '3' });
      b.prisma.bodyPhotoCheck.count.mockResolvedValue(3);
      expect(await b.service.check('p-1', 'f-1', 'FRONT')).toMatchObject({ outcome: 'PASS' });
    });
    it('is a format the model cannot read (HEIC)', async () => {
      const b = build();
      b.uploads.readContents.mockResolvedValue(Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypheic')]));
      await turnedAway(b, /couldn’t read that photo’s format/);
      expect(b.create).not.toHaveBeenCalled();
    });
    it('hits an API error or timeout', async () => {
      const b = build();
      b.create.mockRejectedValue(new Error('overloaded'));
      await turnedAway(b, /isn’t available right now/);
    });
    it('gets an answer that is not what was asked for', async () => {
      const b = build();
      b.create.mockResolvedValue({ content: [{ type: 'text', text: 'Looks fine to me' }] });
      await turnedAway(b, /isn’t available right now/);
      b.create.mockResolvedValue(answer({ pose: 'sideways-ish' }));
      await turnedAway(b, /isn’t available right now/);
    });
    it('cannot read the stored file', async () => {
      const b = build();
      b.uploads.readContents.mockRejectedValue(new Error('storage down'));
      await turnedAway(b, /isn’t available right now/);
    });

    it('is only advisory when PHOTO_CHECK_REQUIRED=false: the photo is accepted for a clinician, with nothing said', async () => {
      const b = build({ PHOTO_CHECK_REQUIRED: 'false' });
      b.create.mockRejectedValue(new Error('overloaded'));
      expect(await b.service.check('p-1', 'f-1', 'FRONT')).toMatchObject({ outcome: 'UNCHECKED', messages: [], canSendForReview: false });
    });
  });
});

describe('PhotoCheckService.assertSavable', () => {
  const latest = (outcome: string) => ({ outcome });

  it('lets through a photo that passed', async () => {
    const { service, prisma } = build();
    prisma.bodyPhotoCheck.findFirst.mockResolvedValue(latest('PASS'));
    await expect(service.assertSavable('p-1', 'f-1', 'FRONT', false)).resolves.toBeUndefined();
  });

  it('refuses a photo that could not be checked, unless checking is not required', async () => {
    const { service, prisma } = build();
    prisma.bodyPhotoCheck.findFirst.mockResolvedValue(latest('UNCHECKED'));
    await expect(service.assertSavable('p-1', 'f-1', 'FRONT', false)).rejects.toThrow(/hasn’t been checked/);
    await expect(service.assertSavable('p-1', 'f-1', 'FRONT', true)).rejects.toThrow(/hasn’t been checked/);
    const relaxed = build({ ANTHROPIC_API_KEY: 'k', PHOTO_CHECK_REQUIRED: 'false' });
    relaxed.prisma.bodyPhotoCheck.findFirst.mockResolvedValue(latest('UNCHECKED'));
    await expect(relaxed.service.assertSavable('p-1', 'f-1', 'FRONT', false)).resolves.toBeUndefined();
  });

  it('refuses a photo that was never checked here, so the check cannot be skipped', async () => {
    const { service, prisma } = build();
    prisma.bodyPhotoCheck.findFirst.mockResolvedValue(null);
    await expect(service.assertSavable('p-1', 'f-1', 'FRONT', false)).rejects.toThrow(/hasn’t been checked/);
  });

  it('refuses a failed photo, unless the patient has retried enough and asks for a review', async () => {
    const { service, prisma } = build();
    prisma.bodyPhotoCheck.findFirst.mockResolvedValue(latest('FAIL'));
    prisma.bodyPhotoCheck.count.mockResolvedValue(1);
    await expect(service.assertSavable('p-1', 'f-1', 'FRONT', false)).rejects.toThrow(/retake/);
    await expect(service.assertSavable('p-1', 'f-1', 'FRONT', true)).rejects.toThrow(BadRequestException);
    prisma.bodyPhotoCheck.count.mockResolvedValue(FAILS_BEFORE_MANUAL_REVIEW);
    await expect(service.assertSavable('p-1', 'f-1', 'FRONT', true)).resolves.toBeUndefined();
    await expect(service.assertSavable('p-1', 'f-1', 'FRONT', false)).rejects.toThrow(/retake/);
  });
});

describe('PhotoCheckService.checkFrame (live guidance)', () => {
  const frame = JPEG.toString('base64');
  const lookingFine = { personCount: 1, faceVisible: true, headToToeVisible: true, pose: 'front', bulkyOrBaggyClothing: false, quality: 'good', notARealPhoto: false, tooFar: false };
  // Live tips come from the local pose model; what it saw is made up here, the geometry has its own specs.
  const buildLive = (env: Record<string, string | undefined> = {}) => {
    const b = build({ PHOTO_CHECK_PROVIDER: 'yolo', ...env });
    b.detector.detect.mockResolvedValue({ width: 1000, height: 2000, people: [] });
    return b;
  };
  afterEach(() => jest.restoreAllMocks());
  const seeing = (over: Record<string, unknown> = {}) => jest.spyOn(require('./pose-geometry'), 'observe').mockReturnValue({ ...lookingFine, ...over });

  it('says what to fix on a frame, with the same rules and wording as the final check, and stores nothing', async () => {
    const { service, prisma } = buildLive();
    seeing({ headToToeVisible: false });
    expect(await service.checkFrame('p-1', 'FRONT', frame)).toEqual({ available: true, ready: false, messages: ['Your full body isn’t visible — we need to see you from head to toe'] });
    seeing();
    expect(await service.checkFrame('p-1', 'FRONT', frame)).toEqual({ available: true, ready: true, messages: [] });
    expect(prisma.bodyPhotoCheck.create).not.toHaveBeenCalled();
  });

  it('gives no live tips at all when Claude is the provider: they would be billed calls outside the daily limit', async () => {
    const b = build({ ANTHROPIC_API_KEY: 'k' });
    expect(await b.service.checkFrame('p-1', 'FRONT', frame)).toEqual({ available: false, ready: false, messages: [] });
    expect(b.create).not.toHaveBeenCalled();
    expect(b.detector.detect).not.toHaveBeenCalled();
  });

  it('gives no guidance, rather than a wrong one, when it cannot', async () => {
    const none = { available: false, ready: false, messages: [] };
    const off = buildLive();
    off.detector.available.mockResolvedValue(false);
    expect(await off.service.checkFrame('p-1', 'FRONT', frame)).toEqual(none);

    const b = buildLive();
    expect(await b.service.checkFrame('p-1', 'FRONT', 'x'.repeat(MAX_FRAME_BASE64 + 1))).toEqual(none); // not a live frame
    expect(await b.service.checkFrame('p-1', 'FRONT', Buffer.from('<html>').toString('base64'))).toEqual(none); // not a JPEG
    b.detector.detect.mockRejectedValue(new Error('cannot read'));
    expect(await b.service.checkFrame('p-1', 'FRONT', frame)).toEqual(none);
  });

  it('stops after a minute’s worth of frames for one patient, and not for another', async () => {
    const { service, detector } = buildLive();
    seeing();
    for (let i = 0; i < FRAMES_PER_MINUTE; i++) expect((await service.checkFrame('p-1', 'FRONT', frame)).available).toBe(true);
    expect((await service.checkFrame('p-1', 'FRONT', frame)).available).toBe(false);
    expect((await service.checkFrame('p-2', 'FRONT', frame)).available).toBe(true);
    expect(detector.detect).toHaveBeenCalledTimes(FRAMES_PER_MINUTE + 1);
  });
});

describe('PhotoCheckService.viewsToRetake', () => {
  it('sends back a saved photo that never passed the check — one saved before checking was set up, or while it was down', async () => {
    const { service, prisma } = build();
    prisma.bodyPhotoCheck.findFirst.mockImplementation(({ where }: any) => Promise.resolve(where.fileId === 'front' ? { outcome: 'UNCHECKED' } : null));
    expect(await service.viewsToRetake('p-1', { FRONT: 'front', SIDE: 'side' })).toEqual(['FRONT', 'SIDE']);
  });

  it('keeps a photo that passed, or that failed and the patient sent for review', async () => {
    const { service, prisma } = build();
    prisma.bodyPhotoCheck.findFirst.mockImplementation(({ where }: any) => Promise.resolve(where.fileId === 'front' ? { outcome: 'PASS', sentForReview: false } : { outcome: 'FAIL', sentForReview: true }));
    expect(await service.viewsToRetake('p-1', { FRONT: 'front', SIDE: 'side' })).toEqual([]);
  });

  it('sends back a failed photo the patient did not ask a clinician to look at, however it got saved', async () => {
    const { service, prisma } = build();
    prisma.bodyPhotoCheck.findFirst.mockResolvedValue({ outcome: 'FAIL', sentForReview: false });
    expect(await service.viewsToRetake('p-1', { FRONT: 'front' })).toEqual(['FRONT']);
  });

  it('ignores a view with no photo yet, and sends nothing back when checking is not required', async () => {
    const { service, prisma } = build();
    expect(await service.viewsToRetake('p-1', { FRONT: null })).toEqual([]);
    const relaxed = build({ ANTHROPIC_API_KEY: 'k', PHOTO_CHECK_REQUIRED: 'false' });
    expect(await relaxed.service.viewsToRetake('p-1', { FRONT: 'front' })).toEqual([]);
    expect(relaxed.prisma.bodyPhotoCheck.findFirst).not.toHaveBeenCalled();
    expect(prisma.bodyPhotoCheck.findFirst).not.toHaveBeenCalled();
  });
});

describe('PhotoCheckService with the YOLO pose model (the default)', () => {
  afterEach(() => jest.restoreAllMocks());
  const buildYolo = (env: Record<string, string | undefined> = {}) => build({ PHOTO_CHECK_PROVIDER: 'yolo', ...env });

  it('uses the pose model, not Claude, and records which model looked', async () => {
    const b = buildYolo();
    b.detector.detect.mockResolvedValue({ width: 1000, height: 2000, people: [] });
    const r = await b.service.check('p-1', 'f-1', 'FRONT');
    expect(r).toMatchObject({ outcome: 'FAIL', issues: ['NO_PERSON'] });
    expect(b.detector.detect).toHaveBeenCalledTimes(1);
    expect(b.create).not.toHaveBeenCalled();
    expect(b.prisma.bodyPhotoCheck.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: expect.objectContaining({ model: 'yolov8n-pose', outcome: 'FAIL' }) });
  });

  it('is not usable — and turns the photo away while required — when the model file is missing', async () => {
    const b = buildYolo();
    b.detector.available.mockResolvedValue(false);
    expect(await b.service.check('p-1', 'f-1', 'FRONT')).toMatchObject({ outcome: 'UNCHECKED', messages: [expect.stringMatching(/isn’t available right now/)] });
    expect(b.detector.detect).not.toHaveBeenCalled();
  });

  it('turns the photo away when the model cannot read the image', async () => {
    const b = buildYolo();
    b.detector.detect.mockRejectedValue(new Error('Input buffer contains unsupported image format'));
    expect(await b.service.check('p-1', 'f-1', 'FRONT')).toMatchObject({ outcome: 'UNCHECKED' });
  });

  it('gives live guidance from the pose model without any Claude call', async () => {
    const b = buildYolo();
    b.detector.detect.mockResolvedValue({ width: 1000, height: 2000, people: [] });
    expect(await b.service.checkFrame('p-1', 'FRONT', JPEG.toString('base64'))).toMatchObject({ available: true, ready: false, messages: ['No person visible in the image'] });
    expect(b.create).not.toHaveBeenCalled();
  });

  it('asks Claude about clothing only when the pose check passed and a key is set — and never for live frames', async () => {
    const b = buildYolo({ ANTHROPIC_API_KEY: 'sk-test' });
    b.detector.detect.mockResolvedValue({ width: 1000, height: 2000, people: [] });
    // The geometry has its own specs; here the pose is made to pass.
    jest.spyOn(require('./pose-geometry'), 'observe').mockReturnValue({ personCount: 1, faceVisible: true, headToToeVisible: true, pose: 'front', bulkyOrBaggyClothing: false, quality: 'good', notARealPhoto: false });
    b.create.mockResolvedValue(answer({ bulky_or_baggy_clothing: true }));
    const r = await b.service.check('p-1', 'f-1', 'FRONT');
    expect(r).toMatchObject({ outcome: 'FAIL', issues: ['BAGGY_CLOTHING'] });
    expect(b.prisma.bodyPhotoCheck.update).toHaveBeenCalledWith({ where: { id: 'c-1' }, data: expect.objectContaining({ model: 'yolov8n-pose+claude-haiku-4-5' }) });

    b.create.mockClear();
    await b.service.checkFrame('p-1', 'FRONT', JPEG.toString('base64'));
    expect(b.create).not.toHaveBeenCalled();
  });

  it('still passes a photo when the optional clothing opinion is unavailable', async () => {
    const b = buildYolo({ ANTHROPIC_API_KEY: 'sk-test' });
    b.detector.detect.mockResolvedValue({ width: 1000, height: 2000, people: [] });
    jest.spyOn(require('./pose-geometry'), 'observe').mockReturnValue({ personCount: 1, faceVisible: true, headToToeVisible: true, pose: 'front', bulkyOrBaggyClothing: false, quality: 'good', notARealPhoto: false });
    b.create.mockRejectedValue(new Error('overloaded'));
    expect(await b.service.check('p-1', 'f-1', 'FRONT')).toMatchObject({ outcome: 'PASS' });
  });
});

describe('PhotoCheckService.markSentForReview', () => {
  it('marks the latest check of a failed photo, and nothing else', async () => {
    const { service, prisma } = build();
    prisma.bodyPhotoCheck.update = jest.fn();
    prisma.bodyPhotoCheck.findFirst.mockResolvedValue({ id: 'c-9', outcome: 'FAIL' });
    await service.markSentForReview('p-1', 'f-1', 'FRONT');
    expect(prisma.bodyPhotoCheck.update).toHaveBeenCalledWith({ where: { id: 'c-9' }, data: { sentForReview: true } });

    prisma.bodyPhotoCheck.update.mockClear();
    prisma.bodyPhotoCheck.findFirst.mockResolvedValue({ id: 'c-9', outcome: 'PASS' });
    await service.markSentForReview('p-1', 'f-1', 'FRONT');
    expect(prisma.bodyPhotoCheck.update).not.toHaveBeenCalled();
  });
});
