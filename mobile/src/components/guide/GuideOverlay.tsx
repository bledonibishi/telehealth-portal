import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui';
import { colors } from '../../theme';

export type GuideRect = { x: number; y: number; width: number; height: number };

const PAD = 6;
// Claims the touch so it doesn't reach the app underneath.
const hold = () => true;
const GAP = 12;
const EDGE = 16;

/**
 * One step of the app guide: the screen dimmed except for what is being explained (`rect`), and a card that says what it
 * is. Without a `rect` the card sits in the middle. Drawn over the whole app by `GuideProvider`; on its own here so its
 * story can show it.
 */
export function GuideOverlay({ rect, screen, tourTitle, title, body, n, total, first, last, onBack, onNext, onClose }: {
  rect: GuideRect | null;
  screen: { width: number; height: number };
  tourTitle: string;
  title: string;
  body: string;
  n: number;
  total: number;
  first: boolean;
  last: boolean;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [cardHeight, setCardHeight] = React.useState(0);
  const cardWidth = Math.min(380, screen.width - EDGE * 2);
  const top = cardTop(rect, cardHeight, screen.height, insets.top + EDGE, screen.height - insets.bottom - EDGE);
  const left = (screen.width - cardWidth) / 2;
  const hole = rect && { x: rect.x - PAD, y: rect.y - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      {/* Taps on the app are held while the guide talks, so one meant for "Next" can't open something underneath. */}
      {hole ? (
        <>
          <View style={[s.scrim, { left: 0, top: 0, right: 0, height: Math.max(0, hole.y) }]} onStartShouldSetResponder={hold} />
          <View style={[s.scrim, { left: 0, top: hole.y + hole.height, right: 0, bottom: 0 }]} onStartShouldSetResponder={hold} />
          <View style={[s.scrim, { left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.height }]} onStartShouldSetResponder={hold} />
          <View style={[s.scrim, { left: hole.x + hole.width, top: hole.y, right: 0, height: hole.height }]} onStartShouldSetResponder={hold} />
          {/* The lit-up part itself is covered too: it is shown, not used, until the guide is closed. */}
          <View style={[s.hole, { left: hole.x, top: hole.y, width: hole.width, height: hole.height }]} onStartShouldSetResponder={hold} />
        </>
      ) : (
        <View style={[s.scrim, StyleSheet.absoluteFill]} onStartShouldSetResponder={hold} />
      )}
      <View
        style={[s.card, { top, left, width: cardWidth, opacity: cardHeight ? 1 : 0 }]}
        onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        accessibilityRole="summary"
        accessibilityLiveRegion="polite"
      >
        <View style={s.head}>
          <Text style={s.kicker}>{tourTitle} · {n} of {total}</Text>
          <Button label="Close" variant="link" small onPress={onClose} />
        </View>
        <Text style={s.title} accessibilityRole="header">{title}</Text>
        <Text style={s.body}>{body}</Text>
        <View style={s.actions}>
          {!first && <Button label="Back" variant="outline" small onPress={onBack} />}
          <Button label={last ? 'Done' : 'Next'} small onPress={onNext} />
        </View>
      </View>
    </View>
  );
}

/** Under what is lit up if it fits, else over it, else at the bottom of the screen. */
function cardTop(rect: GuideRect | null, height: number, screenHeight: number, minTop: number, maxBottom: number) {
  if (!rect) return Math.max(minTop, (screenHeight - height) / 2);
  const below = rect.y + rect.height + PAD + GAP;
  if (below + height <= maxBottom) return below;
  const above = rect.y - PAD - GAP - height;
  if (above >= minTop) return above;
  return Math.max(minTop, maxBottom - height);
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', backgroundColor: colors.scrim },
  hole: { position: 'absolute', borderRadius: 12, borderWidth: 2, borderColor: colors.brand300 },
  card: { position: 'absolute', backgroundColor: colors.white, borderRadius: 18, padding: 16, shadowColor: colors.slate900, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  kicker: { flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.brand700 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink900 },
  body: { fontSize: 14, lineHeight: 20, color: colors.slate600, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
});
