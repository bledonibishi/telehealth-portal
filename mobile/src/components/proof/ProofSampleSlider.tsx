import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { DETAIL_INFO, DetailChip, DetailInfo, Field, FIELDS, MISSING_INFO, useSpotlight } from './DetailChip';

// Mirrors web/src/components/onboarding/ProofSampleSlider.tsx — same photos, outlines and wording.

// Position on the photo, in % of its width and height: left, top, width, height.
type Box = [number, number, number, number];

type Slide = {
  image: ImageSourcePropType;
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

// Photos in assets/proof-samples (copies of web/public/proof-samples). Before production, replace
// any photo you don't hold the rights to; if the new one frames the box differently, update its boxes.
const SLIDES: Slide[] = [
  {
    image: require('../../../assets/proof-samples/box-with-pharmacy-label.jpg'),
    width: 1000,
    height: 853,
    alt: 'A Wegovy 1.5 mg box with a pharmacy label showing the patient’s name and the date',
    verdict: 'good',
    title: 'This works',
    caption: 'Pharmacy label with name and date, plus the box with medicine and dose.',
    marks: { MEDICINE: [2, 19, 30, 10], DOSE: [35, 22, 21, 9], NAME: [14.4, 47, 20.5, 4], DATE: [14.4, 51, 17, 3.5] },
    badgeRight: ['DATE'],
  },
  {
    image: require('../../../assets/proof-samples/box-pen-no-label.jpg'),
    width: 678,
    height: 452,
    alt: 'A Wegovy 1.7 mg pen box with no pharmacy label',
    verdict: 'missing',
    title: 'Not enough on its own',
    caption: 'No name or date — include the pharmacy label on your box.',
    marks: { MEDICINE: [39.5, 39, 21.5, 9.5], DOSE: [66.8, 39, 19.8, 9] },
  },
  {
    image: require('../../../assets/proof-samples/box-tablets-no-label.jpg'),
    width: 1000,
    height: 1000,
    alt: 'A Wegovy 4 mg tablet box with no pharmacy label',
    verdict: 'missing',
    title: 'Not enough on its own',
    caption: 'Same for tablets — turn the box so the pharmacy label is in the photo.',
    marks: { MEDICINE: [18.5, 32.3, 19.8, 6.4], DOSE: [40.4, 34.4, 13.8, 4.8] },
  },
  {
    image: require('../../../assets/proof-samples/several-boxes.jpg'),
    width: 1000,
    height: 800,
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
 * All in % of the photo; dx/dy move the centre. Same as the web slider's lensFor.
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
const FRAME_RATIO = 16 / 9;

const VERDICT = {
  good: { icon: '✓', bg: colors.brand50, fg: colors.brand700 },
  missing: { icon: '✗', bg: colors.amber50, fg: colors.amber800 },
  tip: { icon: 'i', bg: colors.slate100, fg: colors.slate700 },
};


/**
 * Example photos of medicine boxes, one per slide, with the details the check reads outlined and
 * numbered — including examples that aren't enough on their own. `flagged` are the details that
 * didn't match on the patient's last upload (shown amber).
 */
export function ProofSampleSlider({ flagged = [] }: { flagged?: Field[] }) {
  const [index, setIndex] = useState(0);
  const [frameWidth, setFrameWidth] = useState(0);
  const [openField, setOpenField] = useState<Field | null>(null);
  const [lastField, setLastField] = useState<Field | null>(null);
  const touchX = useRef<number | null>(null);
  // One value per detail, so the outlines appear one after another on each slide.
  const reveal = useRef(FIELDS.map(() => new Animated.Value(0))).current;

  const slide = SLIDES[index];
  const verdict = VERDICT[slide.verdict];
  // The outlines take turns: each detail in order grows and pulses for a moment.
  const focusedKey = useSpotlight(
    FIELDS.filter((f) => slide.marks[f.key]).map((f) => f.key),
    openField,
    index,
  );
  // 0 → 1 as each detail's magnified view grows out of its outline; and the photo's dimming.
  const pop = useRef(FIELDS.map(() => new Animated.Value(0))).current;
  const dim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);
  useEffect(() => {
    const duration = reduceMotion ? 0 : 500;
    const easing = Easing.out(Easing.cubic);
    const spotlit = !!focusedKey && !!slide.marks[focusedKey];
    Animated.parallel([
      ...FIELDS.map((f, i) =>
        Animated.timing(pop[i], { toValue: spotlit && f.key === focusedKey ? 1 : 0, duration, easing, useNativeDriver: true }),
      ),
      Animated.timing(dim, { toValue: spotlit ? 1 : 0, duration, easing, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedKey, index, reduceMotion]);
  const go = (i: number) => {
    setIndex((i + SLIDES.length) % SLIDES.length);
    setOpenField(null);
  };

  useEffect(() => {
    reveal.forEach((v) => v.setValue(0));
    Animated.stagger(
      200,
      reveal.map((v) => Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true })),
    ).start();
  }, [index, reveal]);

  // Where the photo sits in the frame when fitted without cropping.
  const frameHeight = frameWidth / FRAME_RATIO;
  const ratio = slide.width / slide.height;
  const photo = ratio >= FRAME_RATIO
    ? { width: frameWidth, height: frameWidth / ratio }
    : { width: frameHeight * ratio, height: frameHeight };

  const info = (() => {
    const field = FIELDS.find((f) => f.key === lastField);
    if (!field) return null;
    return (
      <Text>
        <Text style={{ fontWeight: '700' }}>
          {field.n} {field.label}
        </Text>
        {' — '}
        {slide.marks[field.key] ? DETAIL_INFO[field.key] : MISSING_INFO}
      </Text>
    );
  })();

  return (
    <View style={styles.card} accessibilityLabel="Example photos">
      <View style={styles.header}>
        <View style={[styles.verdict, { backgroundColor: verdict.bg }]}>
          <Text style={[styles.verdictText, { color: verdict.fg }]}>
            {verdict.icon} {slide.title}
          </Text>
        </View>
        <Text style={styles.counter}>
          Example {index + 1} / {SLIDES.length}
        </Text>
      </View>

      <View
        style={[styles.frame, { height: frameHeight || undefined, aspectRatio: frameWidth ? undefined : FRAME_RATIO }]}
        onLayout={(e) => setFrameWidth(e.nativeEvent.layout.width)}
        onTouchStart={(e) => (touchX.current = e.nativeEvent.pageX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.nativeEvent.pageX - touchX.current;
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
          touchX.current = null;
        }}
      >
        {frameWidth > 0 && (
          <View style={{ width: photo.width, height: photo.height }}>
            <Image source={slide.image} style={{ width: '100%', height: '100%' }} accessibilityLabel={slide.alt} />
            {/* Dims the photo a little, so the magnified detail stands out. */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, { opacity: dim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] }) }]} />
            {FIELDS.map((f, i) => {
              const box = slide.marks[f.key];
              if (!box) return null;
              const lens = lensFor(box);
              const warn = flagged.includes(f.key);
              const right = slide.badgeRight?.includes(f.key);
              const tone = warn ? colors.amber400 : colors.brand500;
              // The lens in pixels: its outline's rectangle, and where its centre moves to.
              const lw = (lens.width / 100) * photo.width;
              const lh = (lens.height / 100) * photo.height;
              const lx = (lens.left / 100) * photo.width;
              const ly = (lens.top / 100) * photo.height;
              const dx = (lens.dx / 100) * photo.width;
              const dy = (lens.dy / 100) * photo.height;
              return (
                <React.Fragment key={f.key}>
                  {/* The outline where the detail sits on the photo. Tapping it zooms it, like its chip. */}
                  <Animated.View
                    onStartShouldSetResponder={() => true}
                    onResponderRelease={() => {
                      setLastField(f.key);
                      setOpenField((current) => (current === f.key ? null : f.key));
                    }}
                    style={[
                      styles.mark,
                      {
                        left: lx,
                        top: ly,
                        width: lw,
                        height: lh,
                        borderColor: tone,
                        backgroundColor: warn ? 'rgba(252, 211, 77, 0.2)' : 'rgba(45, 212, 191, 0.15)',
                        opacity: reveal[i],
                        transform: [{ scale: reveal[i].interpolate({ inputRange: [0, 1], outputRange: [1.3, 1] }) }],
                      },
                    ]}
                  >
                    <View style={[styles.markBadge, right ? styles.markBadgeRight : styles.markBadgeLeft, { backgroundColor: warn ? colors.amber500 : colors.brand600 }]}>
                      <Text style={styles.markBadgeText}>{f.n}</Text>
                    </View>
                  </Animated.View>

                  {/* The magnified view: the same part of the photo, grown smoothly out of its outline. */}
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.lens,
                      {
                        left: lx,
                        top: ly,
                        width: lw,
                        height: lh,
                        borderColor: tone,
                        zIndex: f.key === focusedKey ? 20 : 10,
                        opacity: pop[i].interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
                        transform: [
                          { translateX: pop[i].interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                          { translateY: pop[i].interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
                          { scale: pop[i].interpolate({ inputRange: [0, 1], outputRange: [1, lens.scale] }) },
                        ],
                      },
                    ]}
                  >
                    <View style={styles.lensClip}>
                      <Image source={slide.image} style={{ position: 'absolute', left: -lx, top: -ly, width: photo.width, height: photo.height }} />
                    </View>
                    <View style={[styles.lensBadge, { backgroundColor: warn ? colors.amber500 : colors.brand600 }]}>
                      <Text style={styles.lensBadgeText}>{f.n}</Text>
                    </View>
                  </Animated.View>
                </React.Fragment>
              );
            })}
          </View>
        )}

        <Pressable onPress={() => go(index - 1)} style={[styles.arrow, { left: 6 }]} accessibilityLabel="Previous example">
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Pressable onPress={() => go(index + 1)} style={[styles.arrow, { right: 6 }]} accessibilityLabel="Next example">
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>

      {/* The caption, or the tapped chip's explanation in the same spot. */}
      <DetailInfo idle={slide.caption} open={openField !== null} info={info} />

      <View style={[styles.chips, slide.verdict === 'tip' && { opacity: 0 }]} pointerEvents={slide.verdict === 'tip' ? 'none' : 'auto'}>
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
              onToggle={() => {
                setLastField(f.key);
                setOpenField((current) => (current === f.key ? null : f.key));
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verdict: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  verdictText: { fontSize: 12, fontWeight: '600' },
  counter: { fontSize: 12, color: colors.slate400 },
  frame: { marginTop: 8, width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: colors.slate100, alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute', borderRadius: 6, borderWidth: 2 },
  dim: { backgroundColor: '#0f172a' },
  // The magnified view: a frame with a soft drop shadow, clipping a copy of the photo.
  lens: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  lensClip: { flex: 1, borderRadius: 7, overflow: 'hidden' },
  lensBadge: { position: 'absolute', top: -5, left: -5, width: 11, height: 11, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  lensBadgeText: { color: '#fff', fontSize: 7, fontWeight: '700' },
  markBadge: { position: 'absolute', width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  markBadgeLeft: { top: -8, left: -8 },
  markBadgeRight: { right: -21, top: '50%', marginTop: -8 },
  markBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  arrowText: { fontSize: 18, color: colors.slate700, marginTop: -2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 4 },
});
