import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { Button } from '../ui';
import { EMERGENCY_NUMBER, INJECTION_VIDEO_URL, openLink } from '../../lib/config';
import { colors } from '../../theme';

const STEPS: [string, string][] = [
  ['Get ready', 'Wash your hands. Check the label shows your medicine and dose, the liquid is clear and colourless, and it hasn’t expired. If it’s cloudy, has particles, or the pen is damaged, don’t use it.'],
  ['Prepare the pen', 'Follow the leaflet in your box for your pen: some need a new needle each time, some are ready to use. Never share a pen or needle with anyone.'],
  ['Choose a spot', 'Belly (at least a hand’s width from your navel), front or outer thigh, or the back of the upper arm (someone may need to help). Use a different spot from last time, and avoid skin that is bruised, sore, scarred or hard.'],
  ['Clean the skin', 'Wipe the spot with an alcohol wipe and let it dry by itself.'],
  ['Inject', 'Press the pen flat against your skin and press the button as your leaflet shows. Keep it still for as long as the leaflet says (usually a slow count of several seconds) so the whole dose goes in.'],
  ['Finish', 'Take the pen away and don’t rub the spot. Put the used needle or pen in a sharps container, not the bin. A small drop of blood or a little redness is normal.'],
  ['Log it', 'Mark the dose as taken here and choose where you injected, so we can suggest a different spot next time.'],
];

/** A short, product-neutral walkthrough, and the video when one is set for this build. The pen's leaflet has the final say. */
export function InjectionGuideSheet({ visible, onClose, requiresColdChain }: { visible: boolean; onClose: () => void; requiresColdChain: boolean }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="How to inject">
      <Text style={styles.intro}>Nervous about your first one? That’s very common. Take your time, and message your care team if you’d like to talk it through.</Text>
      {INJECTION_VIDEO_URL ? (
        <Button label="▶ Watch the video" variant="soft" onPress={() => openLink(INJECTION_VIDEO_URL!)} />
      ) : (
        <Text style={styles.soon}>▶ Our video is coming soon. The steps below cover the same ground.</Text>
      )}
      {STEPS.map(([title, text], i) => (
        <View key={title} style={styles.step}>
          <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{title}</Text>
            <Text style={styles.stepText}>{text}</Text>
          </View>
        </View>
      ))}
      {requiresColdChain && <Text style={styles.intro}>Keep unused pens in the fridge (2–8°C), never frozen.</Text>}
      <Text style={styles.foot}>These are general steps. Your pen’s leaflet is the guide for your exact device. Severe stomach pain that doesn’t go away, trouble breathing, or swelling of the face or throat is an emergency: call {EMERGENCY_NUMBER}.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, color: colors.slate500, lineHeight: 19 },
  soon: { fontSize: 13, color: colors.slate600, backgroundColor: colors.slate50, borderRadius: 12, padding: 12, lineHeight: 19 },
  step: { flexDirection: 'row', gap: 12 },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink50, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 12, fontWeight: '800', color: colors.ink700 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: colors.slate900 },
  stepText: { fontSize: 13, color: colors.slate600, marginTop: 2, lineHeight: 19 },
  foot: { fontSize: 12, color: colors.slate500, backgroundColor: colors.slate50, borderRadius: 12, padding: 12, lineHeight: 18 },
});
