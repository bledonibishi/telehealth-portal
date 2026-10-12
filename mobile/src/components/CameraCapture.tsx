import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { PoseOutline, PoseView } from './PoseFigure';

export type LiveGuidance = { available: boolean; ready: boolean; messages: string[] };
export type Captured = { uri: string; fileName: string; mimeType: string };

const TIMERS = [0, 5, 10] as const;
const FRAME_EVERY_MS = 1800;
const FRAME_WIDTH = 400;

const GUIDE: Record<PoseView, string> = {
  FRONT: 'Stand facing the camera, arms relaxed. Fit your whole body — head to toe — inside the outline.',
  SIDE: 'Turn so your side faces the camera and look straight ahead. Fit your whole body inside the outline.',
};

/**
 * A live camera for the full-body photos: a body outline to stand in, live tips from the same check the photo
 * goes through ("step back — we can't see your feet"), a self-timer so the phone can be propped up while you step
 * back, and a front/back switch. Hands back the photo; the caller decides what to do with it.
 *
 * Live tips take a small picture every couple of seconds. On iPhones that makes the camera click each time, so
 * the tips start switched off there (and on elsewhere) and the patient can flip them either way.
 */
export function CameraCapture({ view, onCapture, onClose, onUnavailable, onFrame }: {
  view: PoseView;
  onFrame: (jpegBase64: string) => Promise<LiveGuidance>;
  onCapture: (photo: Captured) => void;
  onClose: () => void;
  onUnavailable: (reason: string) => void;
}) {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [ready, setReady] = useState(false);
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(0);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [tips, setTips] = useState(Platform.OS !== 'ios');
  const [live, setLive] = useState<LiveGuidance | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameFn = useRef(onFrame);
  frameFn.current = onFrame;

  useEffect(() => {
    if (permission && !permission.granted) {
      if (permission.canAskAgain) requestPermission();
      else onUnavailable('Camera access is off. Allow it in Settings, or upload a photo instead.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted, permission?.canAskAgain]);

  useEffect(() => () => { if (tick.current) clearInterval(tick.current); }, []);

  // Live tips: one small frame at a time, shown as what to fix. A help, not a requirement: it stops quietly
  // if the check has nothing to offer (not set up, rate limited, an outage) or anything goes wrong.
  useEffect(() => {
    if (!ready || !tips) {
      setLive(null);
      return;
    }
    let alive = true;
    let next: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!alive) return;
      try {
        const shot = await camera.current?.takePictureAsync({ quality: 0.2, skipProcessing: false });
        if (shot?.uri && alive) {
          const small = await ImageManipulator.manipulateAsync(shot.uri, [{ resize: { width: FRAME_WIDTH } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
          const result = small.base64 ? await frameFn.current(small.base64) : null;
          if (!alive) return;
          if (!result?.available) return setLive(null);
          setLive(result);
        }
      } catch {
        if (alive) setLive(null);
        return;
      }
      next = setTimeout(loop, FRAME_EVERY_MS);
    };
    next = setTimeout(loop, 800);
    return () => {
      alive = false;
      clearTimeout(next);
    };
  }, [ready, tips, facing]);

  const snap = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const shot = await camera.current?.takePictureAsync({ quality: 0.85 });
      if (shot?.uri) onCapture({ uri: shot.uri, fileName: `${view.toLowerCase()}.jpg`, mimeType: 'image/jpeg' });
    } catch {
      onUnavailable('The camera couldn’t take the photo. You can upload one instead.');
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture, onUnavailable, view]);

  const shutter = () => {
    if (count !== null) {
      // A second tap cancels the countdown.
      if (tick.current) clearInterval(tick.current);
      setCount(null);
      return;
    }
    if (timer === 0) return void snap();
    let left: number = timer;
    setCount(left);
    tick.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        if (tick.current) clearInterval(tick.current);
        setCount(null);
        snap();
      } else {
        setCount(left);
      }
    }, 1000);
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#fff" />
        <TouchableOpacity style={styles.closeAlone} onPress={onClose}><Text style={styles.round}>✕</Text></TouchableOpacity>
      </View>
    );
  }

  const tone = live ? (live.ready ? 'good' : 'warn') : 'neutral';

  return (
    <View style={styles.root}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} onCameraReady={() => setReady(true)} />

      <View style={[StyleSheet.absoluteFill, styles.center, { paddingTop: 70, paddingBottom: 150 }]} pointerEvents="none">
        <PoseOutline view={view} tone={tone} />
      </View>

      <View style={styles.top}>
        <TouchableOpacity onPress={onClose} accessibilityLabel="Close camera"><Text style={styles.round}>✕</Text></TouchableOpacity>
        <Text style={styles.guide}>{GUIDE[view]}</Text>
        <TouchableOpacity onPress={() => setTips((t) => !t)} accessibilityLabel="Live tips">
          <Text style={[styles.round, tips && styles.roundOn]}>💡</Text>
        </TouchableOpacity>
      </View>

      {count !== null && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none"><Text style={styles.count}>{count}</Text></View>
      )}

      {tips && live && count === null && (
        <View style={styles.tipWrap} pointerEvents="none">
          {live.ready ? (
            <Text style={styles.tipGood}>✓ Looks good — take the photo</Text>
          ) : (
            <View style={styles.tipWarn}>{live.messages.slice(0, 2).map((m) => <Text key={m} style={styles.tipWarnText}>{m}</Text>)}</View>
          )}
        </View>
      )}

      <View style={styles.bottom}>
        <TouchableOpacity onPress={() => setTimer((t) => TIMERS[(TIMERS.indexOf(t) + 1) % TIMERS.length])} accessibilityLabel="Self-timer">
          <Text style={styles.round}>{timer === 0 ? '⏱' : `${timer}s`}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shutterOuter} onPress={shutter} disabled={!ready || busy} accessibilityLabel="Take photo">
          <View style={[styles.shutterInner, count !== null && styles.shutterCancel]} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} accessibilityLabel="Switch camera">
          <Text style={styles.round}>⟲</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingTop: 54 },
  guide: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 18, textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 18, textAlign: 'center', lineHeight: 44, overflow: 'hidden' },
  roundOn: { backgroundColor: 'rgba(251,191,36,0.55)' },
  closeAlone: { position: 'absolute', top: 54, left: 16 },
  count: { fontSize: 120, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 12 },
  tipWrap: { position: 'absolute', left: 0, right: 0, bottom: 150, alignItems: 'center', paddingHorizontal: 16 },
  tipGood: { backgroundColor: '#10b981', color: '#fff', fontWeight: '700', fontSize: 14, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, overflow: 'hidden' },
  tipWarn: { backgroundColor: 'rgba(251,191,36,0.95)', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, maxWidth: 340 },
  tipWarnText: { color: '#451a03', fontSize: 13, fontWeight: '600', marginTop: 2 },
  bottom: { position: 'absolute', bottom: 40, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 24 },
  shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  shutterCancel: { borderRadius: 8, width: 30, height: 30, backgroundColor: '#f43f5e' },
});
