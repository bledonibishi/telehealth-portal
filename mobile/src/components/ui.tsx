import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { describeError } from '@telehealth/shared-types';
import { colors } from '../theme';
import { useLayout } from '../lib/layout';

/** The page every treatment screen sits on: a title, a scrolling body that is a centred column on a tablet. */
export function Screen({ title, subtitle, right, children, refreshing, onRefresh }: {
  title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void;
}) {
  const { gutter, contentMaxWidth } = useLayout();
  return (
    <SafeAreaView style={s.page} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={{ padding: gutter, paddingBottom: 40, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} accessibilityRole="header">{title}</Text>
            {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Cards side by side on a tablet, stacked on a phone. Children share the width equally. */
export function Columns({ children }: { children: React.ReactNode }) {
  const { isTablet } = useLayout();
  const kids = React.Children.toArray(children).filter(Boolean);
  if (!isTablet) return <View style={{ gap: 14 }}>{kids}</View>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {kids.map((k, i) => <View key={i} style={{ flexBasis: '48%', flexGrow: 1, minWidth: 300 }}>{k}</View>)}
    </View>
  );
}

export function Card({ children, style, tone = 'plain' }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'plain' | 'warn' | 'danger' | 'good' | 'info' }) {
  return <View style={[s.card, tone !== 'plain' && TONES[tone], style]}>{children}</View>;
}

const TONES = StyleSheet.create({
  warn: { backgroundColor: colors.amber50, borderColor: colors.amber200 },
  danger: { backgroundColor: colors.red50, borderColor: colors.red200 },
  good: { backgroundColor: colors.emerald50, borderColor: colors.emerald100 },
  info: { backgroundColor: colors.ink50, borderColor: colors.ink100 },
});

export function CardTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={s.cardTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitle} accessibilityRole="header">{title}</Text>
        {!!subtitle && <Text style={s.cardSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

type ButtonVariant = 'primary' | 'soft' | 'outline' | 'danger' | 'link';
export function Button({ label, onPress, variant = 'primary', disabled, loading, small, style }: {
  label: string; onPress: () => void; variant?: ButtonVariant; disabled?: boolean; loading?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [s.btn, small && s.btnSmall, BTN[variant], off && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.white : colors.ink700} /> : <Text style={[s.btnText, small && { fontSize: 13 }, BTN_TEXT[variant]]}>{label}</Text>}
    </Pressable>
  );
}

const BTN = StyleSheet.create({
  primary: { backgroundColor: colors.ink700 },
  soft: { backgroundColor: colors.ink50 },
  outline: { borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white },
  danger: { backgroundColor: colors.danger },
  link: { paddingHorizontal: 0, minHeight: 0, paddingVertical: 4, alignSelf: 'flex-start' },
});
const BTN_TEXT = StyleSheet.create({
  primary: { color: colors.white },
  soft: { color: colors.ink800 },
  outline: { color: colors.slate700 },
  danger: { color: colors.white },
  link: { color: colors.ink600 },
});

export function Pill({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'good' | 'warn' | 'danger' | 'info' }) {
  const t = PILL[tone];
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
      <Text style={[s.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}
const PILL = {
  plain: { bg: colors.slate100, fg: colors.slate600 },
  good: { bg: colors.emerald50, fg: colors.emerald700 },
  warn: { bg: colors.amber100, fg: colors.amber800 },
  danger: { bg: colors.red100, fg: colors.red800 },
  info: { bg: colors.ink50, fg: colors.ink800 },
};

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'danger' }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, tone === 'good' && { color: colors.emerald700 }, tone === 'danger' && { color: colors.danger }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={s.barTrack}>
      <View style={[s.barFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
    </View>
  );
}

export function Notice({ tone = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'danger' | 'good'; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card tone={tone} style={{ marginBottom: 14 }}>
      {!!title && <Text style={[s.noticeTitle, tone === 'danger' && { color: colors.red800 }, tone === 'warn' && { color: colors.amber900 }]}>{title}</Text>}
      {typeof children === 'string' ? <Text style={s.noticeText}>{children}</Text> : children}
      {action}
    </Card>
  );
}

export function Field({ label, hint, ...input }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={{ flex: 1, minWidth: 90 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.slate400} style={s.input} {...input} />
      {!!hint && <Text style={s.fieldHint}>{hint}</Text>}
    </View>
  );
}

export const Empty = ({ children }: { children: string }) => <Text style={s.empty}>{children}</Text>;
/**
 * One line of error or warning text under a form or button. Pass whatever failed (an Apollo error, an Error, a message):
 * it shows a safe message, in red for an error and amber for a warning, and nothing when there is no error.
 */
export function ErrorText({ error }: { error: unknown }) {
  const described = describeError(error);
  if (!described) return null;
  return <Text style={[s.error, described.severity === 'warning' && s.warning]} accessibilityRole="alert">{described.message}</Text>;
}
export const Divider = () => <View style={s.divider} />;

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink900, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: colors.slate500, marginTop: 2, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.slate200 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink900 },
  cardSubtitle: { fontSize: 12, color: colors.slate500, marginTop: 2, lineHeight: 17 },
  btn: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 36, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 7 },
  btnText: { fontSize: 15, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  statLabel: { fontSize: 11, color: colors.slate400 },
  statValue: { fontSize: 15, fontWeight: '700', color: colors.slate800, marginTop: 1 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.slate200, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.ink600 },
  noticeTitle: { fontSize: 15, fontWeight: '700', color: colors.ink900 },
  noticeText: { fontSize: 13, color: colors.slate600, marginTop: 4, lineHeight: 19 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.slate500, marginBottom: 4 },
  fieldHint: { fontSize: 11, color: colors.slate400, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.slate200, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: colors.slate900, backgroundColor: colors.white },
  empty: { fontSize: 13, color: colors.slate500, lineHeight: 19 },
  error: { fontSize: 13, color: colors.danger, marginTop: 8 },
  warning: { color: colors.amber800 },
  divider: { height: 1, backgroundColor: colors.slate100, marginVertical: 10 },
});
