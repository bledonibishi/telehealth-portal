import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/**
 * A card that slides up from the bottom of the screen over a dimmed backdrop, and slides back
 * down when closed. Tapping the backdrop or the back button closes it.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  // Stays mounted while sliding down, so the closing animation is seen.
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] },
        ]}
      >
        <View style={styles.handle} />
        {!!title && <Text style={styles.title}>{title}</Text>}
        {children}
      </Animated.View>
    </Modal>
  );
}

/** A full-width option row for a BottomSheet. */
export function SheetOption({
  icon,
  label,
  hint,
  onPress,
  primary,
}: {
  icon: string;
  label: string;
  hint?: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.option, primary && styles.optionPrimary, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={[styles.optionIcon, primary && styles.optionIconPrimary]}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, primary && { color: colors.white }]}>{label}</Text>
        {!!hint && <Text style={[styles.optionHint, primary && { color: colors.brand100 }]}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.slate200, marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '700', color: colors.slate900, marginBottom: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.white,
  },
  optionPrimary: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  optionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.slate100, alignItems: 'center', justifyContent: 'center' },
  optionIconPrimary: { backgroundColor: 'rgba(255,255,255,0.18)' },
  optionLabel: { fontSize: 15, fontWeight: '600', color: colors.slate900 },
  optionHint: { fontSize: 12, color: colors.slate500, marginTop: 2 },
});
