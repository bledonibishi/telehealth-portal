'use client';

import { useRef, useState } from 'react';
import type { ProofCheck } from './ProofReview';
import { DETAIL_INFO, DetailChip, DetailInfo, MISSING_INFO, useSpotlight } from './DetailChip';

type Field = ProofCheck['key'];
// Position on the photo, in % of its width and height: left, top, width, height.
type Box = [number, number, number, number];

type Slide = {
  src: string;
  // The photo's pixel size, to fit it into the fixed frame without cropping.
  width: number;
  height: number;
  alt: string;
  verdict: 'good' | 'missing' | 'tip';
  title: string;
  caption: string;
  marks: Partial<Record<Field, Box>>;
  // Number badges sit top-left of their box; these sit to its right instead, where boxes are close together.
  badgeRight?: Field[];
};

// Photos in public/proof-samples. Before production, replace any photo you don't hold the rights to
// with your own or a licensed one; if the new photo frames the box differently, update its boxes.
const SLIDES: Slide[] = [
  {
    src: '/proof-samples/box-with-pharmacy-label.jpg',
    width: 1358,
    height: 1158,
    alt: 'A Wegovy 1.5 mg box with a pharmacy label showing the patient’s name and the date',
    verdict: 'good',
    title: 'This works',
    caption: 'Pharmacy label with name and date, plus the box with medicine and dose.',
    marks: { MEDICINE: [2, 19, 30, 10], DOSE: [35, 22, 21, 9], NAME: [14.4, 47, 20.5, 4], DATE: [14.4, 51, 17, 3.5] },
    badgeRight: ['DATE'],
  },
  {
    src: '/proof-samples/box-pen-no-label.jpg',
    width: 678,
    height: 452,
    alt: 'A Wegovy 1.7 mg pen box with no pharmacy label',
    verdict: 'missing',
    title: 'Not enough on its own',
    caption: 'No name or date — include the pharmacy label on your box.',
    marks: { MEDICINE: [39.5, 39, 21.5, 9.5], DOSE: [66.8, 39, 19.8, 9] },
  },
  {
    src: '/proof-samples/box-tablets-no-label.webp',
    width: 1254,
    height: 1254,
    alt: 'A Wegovy 4 mg tablet box with no pharmacy label',
    verdict: 'missing',
    title: 'Not enough on its own',
    caption: 'Same for tablets — turn the box so the pharmacy label is in the photo.',
    marks: { MEDICINE: [18.5, 32.3, 19.8, 6.4], DOSE: [40.4, 34.4, 13.8, 4.8] },
  },
  {
    src: '/proof-samples/several-boxes.webp',
    width: 1200,
    height: 960,
    alt: 'Several Wegovy and Ozempic boxes in one photo',
    verdict: 'tip',
    title: 'One box at a time',
    caption: 'Photograph only the box you’re using now.',
    marks: {},
  },
];

// Outlines are drawn a little larger than the text they surround, in % of the photo.
const PAD_X = 1.2;
const PAD_Y = 0.8;

/**
 * Where a detail's outline sits on the photo, and how its magnified view grows out of it: scaled
 * to about half the photo's width (1.8–2.6×), then moved just enough to stay inside the photo.
 * All in % of the photo; dx/dy move the centre.
 */
function lensFor([x, y, w, h]: Box) {
  const left = Math.max(0, x - PAD_X);
  const top = Math.max(0, y - PAD_Y);
  const width = Math.min(100 - left, w + 2 * PAD_X);
  const height = Math.min(100 - top, h + 2 * PAD_Y);
  const scale = Math.min(2.6, Math.max(1.8, 48 / width), 90 / height, 96 / width);
  const cx = left + width / 2;
  const cy = top + height / 2;
  const sw = width * scale;
  const sh = height * scale;
  const nx = Math.min(Math.max(cx - sw / 2, 2), 98 - sw);
  const ny = Math.min(Math.max(cy - sh / 2, 2), 98 - sh);
  return { left, top, width, height, scale, dx: nx + sw / 2 - cx, dy: ny + sh / 2 - cy };
}

// Every slide shows in the same frame, so the card doesn't change size as the patient swipes.
// Wide and short, so the upload buttons below stay on screen.
const FRAME_RATIO = 16 / 9;

/** Where a photo sits inside the frame when fitted without cropping, as % of the frame. */
function fit(slide: Slide) {
  const ratio = slide.width / slide.height;
  return ratio >= FRAME_RATIO
    ? { width: 100, height: (FRAME_RATIO / ratio) * 100 }
    : { width: (ratio / FRAME_RATIO) * 100, height: 100 };
}

const FIELDS: { key: Field; n: number; label: string }[] = [
  { key: 'NAME', n: 1, label: 'Name' },
  { key: 'MEDICINE', n: 2, label: 'Medicine' },
  { key: 'DOSE', n: 3, label: 'Dose' },
  { key: 'DATE', n: 4, label: 'Date' },
];

const VERDICT = {
  good: { icon: '✓', cls: 'bg-ink-50 text-ink-800' },
  missing: { icon: '✗', cls: 'bg-amber-50 text-amber-800' },
  tip: { icon: 'i', cls: 'bg-slate-100 text-slate-700' },
};

/**
 * Example photos of medicine boxes, one per slide, with the details the check reads outlined and
 * numbered — including examples that aren't enough on their own. `flagged` are the details that
 * didn't match on the patient's last upload (shown amber). Kept compact so the upload buttons
 * below it are visible without scrolling.
 */
export function ProofSampleSlider({ flagged = [] }: { flagged?: Field[] }) {
  const [index, setIndex] = useState(0);
  // The detail whose chip is open; its outline on the photo is emphasised.
  const [openField, setOpenField] = useState<Field | null>(null);
  // The last chip opened, kept while its explanation fades out.
  const [lastField, setLastField] = useState<Field | null>(null);
  const touchX = useRef<number | null>(null);
  const slide = SLIDES[index];
  const go = (i: number) => setIndex((i + SLIDES.length) % SLIDES.length);

  // The outlines take turns: each detail in order grows and pulses for a moment.
  const focusedKey = useSpotlight(
    FIELDS.filter((f) => slide.marks[f.key]).map((f) => f.key),
    openField,
    index,
  );
  const verdict = VERDICT[slide.verdict];
  const frame = fit(slide);
  const infoFor = (key: Field | null) => {
    const field = FIELDS.find((f) => f.key === key);
    if (!field) return null;
    return (
      <>
        <span className="font-semibold">
          {field.n} {field.label}
        </span>{' '}
        — {slide.marks[field.key] ? DETAIL_INFO[field.key] : MISSING_INFO}
      </>
    );
  };

  return (
    <figure className="mt-4 rounded-2xl border border-slate-200 bg-white p-3" aria-roledescription="carousel" aria-label="Example photos">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${verdict.cls}`}>
          <span aria-hidden>{verdict.icon}</span> {slide.title}
        </span>
        <span className="text-xs text-slate-400">
          Example {index + 1} / {SLIDES.length}
        </span>
      </div>

      <div
        className="relative mt-2 rounded-xl overflow-hidden bg-slate-100 select-none"
        style={{ aspectRatio: `${FRAME_RATIO}` }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
          touchX.current = null;
        }}
      >
        {/* The photo, centred in the frame at its own proportions; highlights are % of the photo.
            key: restarts the highlight animation on every slide. */}
        <div
          key={slide.src}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: `${frame.width}%`, height: `${frame.height}%` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.src} alt={slide.alt} className="w-full h-full block" draggable={false} />
          {/* Dims the photo a little, so the magnified detail stands out. */}
          <span
            className={`pointer-events-none absolute inset-0 bg-slate-900 transition-opacity duration-500 ${focusedKey && slide.marks[focusedKey] ? 'opacity-25' : 'opacity-0'}`}
            aria-hidden
          />
          {FIELDS.filter((f) => slide.marks[f.key]).map((f, i) => {
            const lens = lensFor(slide.marks[f.key]!);
            const warn = flagged.includes(f.key);
            const right = slide.badgeRight?.includes(f.key);
            const focused = focusedKey === f.key;
            return (
              <span key={f.key}>
                {/* The outline where the detail sits on the photo. Hovering it zooms it, like its chip. */}
                <span
                  onMouseEnter={() => {
                    setLastField(f.key);
                    setOpenField(f.key);
                  }}
                  onMouseLeave={() => setOpenField((current) => (current === f.key ? null : current))}
                  onClick={() => {
                    setLastField(f.key);
                    setOpenField((current) => (current === f.key ? null : f.key));
                  }}
                  className={`absolute rounded-md ring-2 cursor-zoom-in animate-[proof-mark_0.5s_ease-out_both] ${
                    warn ? 'ring-amber-400 bg-amber-300/20' : 'ring-ink-500 bg-ink-500/15'
                  }`}
                  style={{ left: `${lens.left}%`, top: `${lens.top}%`, width: `${lens.width}%`, height: `${lens.height}%`, animationDelay: `${i * 0.25}s` }}
                >
                  <span
                    className={`absolute w-4 h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center shadow ${
                      right ? 'left-full ml-1 top-1/2 -translate-y-1/2' : '-top-2 -left-2'
                    } ${warn ? 'bg-amber-500' : 'bg-ink-700'}`}
                  >
                    {f.n}
                  </span>
                </span>
                {/* The magnified view: the same part of the photo, grown smoothly out of its outline. */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute rounded-lg ring-[3px] bg-no-repeat motion-safe:transition-[transform,opacity] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    focused ? 'z-20 opacity-100' : 'z-10 opacity-0'
                  } ${
                    warn
                      ? 'ring-amber-400 shadow-[0_10px_30px_rgba(15,23,42,0.35),0_0_0_6px_rgba(251,191,36,0.25)]'
                      : 'ring-ink-500 shadow-[0_10px_30px_rgba(15,23,42,0.35),0_0_0_6px_rgba(53,99,201,0.25)]'
                  }`}
                  style={{
                    left: `${lens.left}%`,
                    top: `${lens.top}%`,
                    width: `${lens.width}%`,
                    height: `${lens.height}%`,
                    backgroundImage: `url(${slide.src})`,
                    backgroundSize: `${10000 / lens.width}% ${10000 / lens.height}%`,
                    backgroundPosition: `${lens.width < 100 ? (lens.left / (100 - lens.width)) * 100 : 0}% ${lens.height < 100 ? (lens.top / (100 - lens.height)) * 100 : 0}%`,
                    transform: focused
                      ? `translate(${(lens.dx / lens.width) * 100}%, ${(lens.dy / lens.height) * 100}%) scale(${lens.scale})`
                      : 'translate(0, 0) scale(1)',
                  }}
                >
                  <span
                    className={`absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full text-[7px] font-bold text-white flex items-center justify-center shadow ${
                      warn ? 'bg-amber-500' : 'bg-ink-700'
                    }`}
                  >
                    {f.n}
                  </span>
                </span>
              </span>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => go(index - 1)}
          aria-label="Previous example"
          className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow text-slate-700 flex items-center justify-center hover:bg-white"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          aria-label="Next example"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow text-slate-700 flex items-center justify-center hover:bg-white"
        >
          ›
        </button>
      </div>

      {/* The caption, or the open chip's explanation in the same spot. */}
      <DetailInfo idle={slide.caption} open={openField !== null} info={infoFor(lastField)} />

      <ul
        className={`mt-1 flex flex-wrap justify-center gap-1.5 ${slide.verdict === 'tip' ? 'invisible' : ''}`}
        aria-hidden={slide.verdict === 'tip'}
      >
        {FIELDS.map((f) => {
          const shown = !!slide.marks[f.key];
          return (
            <DetailChip
              key={f.key}
              n={f.n}
              label={f.label}
              state={!shown ? 'missing' : flagged.includes(f.key) ? 'flagged' : 'shown'}
              open={openField === f.key}
              highlighted={focusedKey === f.key}
              onOpenChange={(open) => {
                if (open) setLastField(f.key);
                setOpenField((current) => (open ? f.key : current === f.key ? null : current));
              }}
            />
          );
        })}
      </ul>
    </figure>
  );
}
