import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Alert, Modal } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import * as ImagePicker from 'expo-image-picker';
import { AuthedImage, fileIdOfUrl } from '../../components/AuthedImage';
import { PoseFigure, PoseView } from '../../components/PoseFigure';
import { CameraCapture } from '../../components/CameraCapture';
import { CHECK_BODY_PHOTO, CHECK_PHOTO_FRAME, DISCARD_BODY_PHOTO, MY_ONBOARDING, SAVE_BODY_PHOTO } from '../../graphql/onboarding';
import { uploadImage } from '../../lib/upload';
import { ErrorText } from '../../components/ui';

type Phase = 'guide' | 'checking' | 'failed' | 'saved' | 'done';
type Result = { outcome: 'PASS' | 'FAIL' | 'UNCHECKED'; issues: string[]; messages: string[]; canSendForReview: boolean };
type Attempt = { fileId: string; uri: string; result: Result };
type Saved = Record<PoseView, string | null>;

const KIND = { FRONT: 'BODY_PHOTO_FRONT', SIDE: 'BODY_PHOTO_SIDE' } as const;
const LABEL: Record<PoseView, { name: string; of: string; word: string }> = {
  FRONT: { name: 'Front-facing', of: 'Photo 1 of 2: Front-facing', word: 'front' },
  SIDE: { name: 'Side-facing', of: 'Photo 2 of 2: Side-facing', word: 'side' },
};
const CHECKLIST: Record<PoseView, Array<[boolean, string]>> = {
  FRONT: [[true, 'Face clearly visible'], [true, 'Full body visible, head to toe'], [true, 'Light-coloured, fitted clothing'], [false, 'No hoodies, coats, or baggy layers']],
  SIDE: [[true, 'Turn so your side faces the camera'], [true, 'Full body visible, head to toe'], [true, 'Fitted clothing, arms relaxed at your sides'], [false, 'No hoodies, coats, or baggy layers']],
};

/**
 * The two full-body photos, one after the other: how to stand (a good and a bad example), the camera or an upload,
 * an automatic check that says at once what to fix, and each photo saved the moment it passes — so leaving halfway
 * loses nothing and coming back picks up at the photo that is still missing. A photo that doesn't pass can't be saved.
 */
export function BodyPhotoScreen({ navigation }: any) {
  const { data, loading } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const [check] = useMutation(CHECK_BODY_PHOTO);
  const [save] = useMutation(SAVE_BODY_PHOTO, { refetchQueries: [{ query: MY_ONBOARDING }] });
  const [discard] = useMutation(DISCARD_BODY_PHOTO);
  const [checkFrame] = useMutation(CHECK_PHOTO_FRAME);

  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<Saved>({ FRONT: null, SIDE: null });
  const [view, setView] = useState<PoseView>('FRONT');
  const [phase, setPhase] = useState<Phase>('guide');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [problem, setProblem] = useState<unknown>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraNote, setCameraNote] = useState('');
  const [fails, setFails] = useState<Record<PoseView, number>>({ FRONT: 0, SIDE: 0 });

  const o = data?.myOnboarding;
  const retake: PoseView[] = o?.bodyPhotosToRetake ?? [];

  // Start from what is already saved: at the photo still missing, or on the summary when both are there.
  useEffect(() => {
    if (ready || !o) return;
    const initial: Saved = { FRONT: fileIdOfUrl(o.bodyPhotoFrontUrl), SIDE: fileIdOfUrl(o.bodyPhotoSideUrl) };
    setSaved(initial);
    setView(initial.FRONT ? 'SIDE' : 'FRONT');
    setPhase(initial.FRONT && initial.SIDE ? 'done' : 'guide');
    setReady(true);
  }, [o, ready]);

  // A passed photo is shown for a moment, then the flow moves on by itself.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (phase !== 'saved') return;
    timer.current = setTimeout(advance, 1600);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const advance = () => {
    clearTimeout(timer.current);
    if (view === 'FRONT' && !saved.SIDE) {
      setView('SIDE');
      setPhase('guide');
    } else if (saved.FRONT && saved.SIDE) {
      setPhase('done');
    } else {
      setView(saved.FRONT ? 'SIDE' : 'FRONT');
      setPhase('guide');
    }
    setAttempt(null);
  };

  /** A photo that was checked and not kept is deleted, so a failed picture of someone's body doesn't linger. */
  const dropAttempt = () => {
    if (attempt?.fileId) discard({ variables: { fileId: attempt.fileId } }).catch(() => undefined);
    setAttempt(null);
  };

  const persist = async (a: Attempt, sendForReview: boolean) => {
    setProblem(null);
    try {
      await save({ variables: { input: { view, fileId: a.fileId, sendForReview } } });
      setSaved((s) => ({ ...s, [view]: a.fileId }));
      setPhase('saved');
    } catch (err: any) {
      setProblem(err);
      setPhase('failed');
    }
  };

  const handlePicked = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets?.[0]) return;
    handleAsset(result.assets[0]);
  };

  const handleAsset = async (asset: { uri: string; fileName?: string | null; mimeType?: string | null }) => {
    setProblem(null);
    dropAttempt();
    setPhase('checking');
    setAttempt({ fileId: '', uri: asset.uri, result: { outcome: 'UNCHECKED', issues: [], messages: [], canSendForReview: false } });
    try {
      const fileId = await uploadImage(KIND[view], { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
      const { data: checked } = await check({ variables: { fileId, view } });
      const res: Result = checked.checkBodyPhoto;
      const a = { fileId, uri: asset.uri, result: res };
      setAttempt(a);
      if (res.outcome === 'FAIL') {
        setFails((f) => ({ ...f, [view]: f[view] + 1 }));
        setPhase('failed');
      } else if (res.outcome === 'UNCHECKED' && res.messages.length) {
        // The check could not run and photos need it: the photo is not saved, and the patient is told why.
        setPhase('failed');
      } else {
        await persist(a, false);
      }
    } catch (err: any) {
      setAttempt(null);
      setProblem(err);
      setPhase('guide');
    }
  };

  const takePhoto = async () => {
    setProblem(null);
    // The live camera, with its outline and tips; the phone's own camera app if that can't be used here.
    if (!cameraNote) return setCameraOpen(true);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Enable camera access in Settings to take a photo.');
      return;
    }
    handlePicked(await ImagePicker.launchCameraAsync({ quality: 0.8 }));
  };

  const pickFile = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo library access needed', 'Enable photo access in Settings to upload a file.');
      return;
    }
    handlePicked(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 }));
  };

  const retakeView = (v: PoseView) => {
    setView(v);
    setProblem(null);
    setPhase('guide');
  };

  if (loading && !ready) return <ActivityIndicator style={styles.center} />;

  const camera = (
    <Modal visible={cameraOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCameraOpen(false)}>
      <CameraCapture
        view={view}
        onClose={() => setCameraOpen(false)}
        onCapture={(photo) => { setCameraOpen(false); handleAsset(photo); }}
        onFrame={async (image) => (await checkFrame({ variables: { view, image } })).data.checkPhotoFrame}
        onUnavailable={(reason) => { setCameraOpen(false); setCameraNote(reason); }}
      />
    </Modal>
  );

  const bars = [saved.FRONT ? 1 : phase !== 'done' && view === 'FRONT' ? 0.45 : 0, saved.SIDE ? 1 : phase !== 'done' && view === 'SIDE' ? 0.45 : 0, phase === 'done' ? 1 : 0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {camera}
      <View style={styles.segments} accessibilityRole="progressbar">
        {bars.map((w, i) => (
          <View key={i} style={styles.segment}><View style={[styles.segmentFill, { width: `${w * 100}%` }]} /></View>
        ))}
      </View>

      {/* ── How to stand, and how to take it ──────────────────────────────── */}
      {phase === 'guide' && (
        <View>
          <Text style={styles.title}>Full body photo</Text>
          <Text style={styles.subtitle}>{LABEL[view].of}</Text>
          {retake.includes(view) && !saved[view] && (
            <Text style={styles.notice}>Your earlier {LABEL[view].word} photo didn’t pass our photo check, so we need a new one.</Text>
          )}
          {!!saved.FRONT && view === 'SIDE' && !saved.SIDE && <Text style={styles.savedPill}>✓ Front photo saved</Text>}

          <View style={styles.card}>
            <View style={styles.figures}>
              <View style={styles.figureCol}>
                <PoseFigure view={view} variant="good" />
                <Text style={[styles.tag, styles.tagGood]}>✓ DO THIS</Text>
              </View>
              <View style={styles.figureCol}>
                <PoseFigure view={view} variant="bad" />
                <Text style={[styles.tag, styles.tagBad]}>✕ AVOID</Text>
              </View>
            </View>
            <View style={styles.divider} />
            {CHECKLIST[view].map(([ok, text]) => (
              <View key={text} style={styles.checkRow}>
                <Text style={[styles.checkIcon, ok ? styles.checkOk : styles.checkNo]}>{ok ? '✓' : '✕'}</Text>
                <Text style={styles.checkText}>{text}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.reassure}>
            Checks like these are a regulatory requirement so we can give you the best treatment possible. Only you and your doctor can see your photos.
          </Text>

          {!!cameraNote && <Text style={styles.notice}>{cameraNote}</Text>}
          <ErrorText error={problem} />

          <TouchableOpacity style={styles.primary} onPress={takePhoto}><Text style={styles.primaryText}>Take photo</Text></TouchableOpacity>
          <TouchableOpacity style={styles.outline} onPress={pickFile}><Text style={styles.outlineText}>Upload file</Text></TouchableOpacity>
          {!!saved[view] && (
            <TouchableOpacity style={styles.link} onPress={advance}><Text style={styles.linkText}>Keep my current photo</Text></TouchableOpacity>
          )}
          <Text style={styles.fine}>
            We check each photo automatically so you know straight away if it can’t be used. Tip: lean your phone against something and use the timer, or ask someone to help. A clinician still reviews every photo.
          </Text>
        </View>
      )}

      {/* ── Checking ──────────────────────────────────────────────────────── */}
      {phase === 'checking' && (
        <View style={styles.centered}>
          <Text style={styles.subtitle}>{LABEL[view].of}</Text>
          {!!attempt?.uri && <Image source={{ uri: attempt.uri }} style={styles.preview} resizeMode="contain" />}
          <ActivityIndicator style={{ marginTop: 20 }} color="#0ea5e9" />
          <Text style={styles.checkingTitle}>Checking your photo…</Text>
          <Text style={styles.subtitle}>This takes a few seconds.</Text>
        </View>
      )}

      {/* ── Not usable: say exactly what to fix ───────────────────────────── */}
      {phase === 'failed' && attempt && (
        <View>
          <Text style={styles.bigTitle}>
            {attempt.result.outcome === 'UNCHECKED' ? 'We couldn’t check your photo' : `Let’s try your ${LABEL[view].word} photo again`}
          </Text>
          <Text style={styles.subtitle}>{LABEL[view].of}</Text>
          <View style={styles.card}>
            <Image source={{ uri: attempt.uri }} style={styles.preview} resizeMode="contain" />
          </View>
          <View style={styles.found}>
            <Text style={styles.foundTitle}>⚠ {attempt.result.outcome === 'UNCHECKED' ? 'What happened' : 'What our check found'}</Text>
            {(attempt.result.messages.length ? attempt.result.messages : ['This photo can’t be used']).map((m) => (
              <Text key={m} style={styles.foundItem}>• {m}</Text>
            ))}
          </View>
          <ErrorText error={problem} />
          <TouchableOpacity style={styles.primary} onPress={() => { dropAttempt(); setPhase('guide'); takePhoto(); }}>
            <Text style={styles.primaryText}>Retake photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outline} onPress={() => { dropAttempt(); setPhase('guide'); pickFile(); }}>
            <Text style={styles.outlineText}>Upload file</Text>
          </TouchableOpacity>
          {attempt.result.canSendForReview && (
            <View style={styles.reviewBox}>
              <Text style={styles.reviewText}>Tried a few times? A clinician can look at this photo themselves instead.</Text>
              <TouchableOpacity onPress={() => persist(attempt, true)}><Text style={styles.linkText}>Send it to a clinician</Text></TouchableOpacity>
            </View>
          )}
          <Text style={styles.fine}>{fails[view] > 1 ? `${fails[view]} tries so far — ` : ''}tips: stand a few steps back, use good light, and use the self-timer or ask someone to help.</Text>
        </View>
      )}

      {/* ── Saved ─────────────────────────────────────────────────────────── */}
      {phase === 'saved' && attempt && (
        <View style={styles.centered}>
          <View>
            <Image source={{ uri: attempt.uri }} style={styles.preview} resizeMode="contain" />
            <View style={styles.tick}><Text style={styles.tickText}>✓</Text></View>
          </View>
          <Text style={styles.checkingTitle}>{attempt.result.outcome === 'PASS' ? 'Looks good!' : attempt.result.outcome === 'FAIL' ? 'Sent to a clinician' : 'Photo saved'}</Text>
          <Text style={styles.subtitle}>
            {attempt.result.outcome === 'PASS' ? 'Saved.' : attempt.result.outcome === 'FAIL' ? 'A clinician will look at this photo themselves.' : 'A clinician will check this photo for you.'}
            {view === 'FRONT' && !saved.SIDE ? ' Next: your side photo.' : ''}
          </Text>
          <TouchableOpacity style={[styles.primary, { alignSelf: 'stretch' }]} onPress={advance}>
            <Text style={styles.primaryText}>{view === 'FRONT' && !saved.SIDE ? 'Continue to side photo' : 'Continue'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Both saved ────────────────────────────────────────────────────── */}
      {phase === 'done' && (
        <View>
          <Text style={styles.title}>Both photos are saved</Text>
          <Text style={styles.subtitle}>Your doctor reviews them with the rest of your application.</Text>
          <View style={styles.thumbs}>
            {(['FRONT', 'SIDE'] as const).map((v) => (
              <View key={v} style={styles.thumbCol}>
                {saved[v] && <AuthedImage fileId={saved[v]!} style={styles.thumb} />}
                <Text style={styles.thumbLabel}>{LABEL[v].name}</Text>
                <TouchableOpacity onPress={() => retakeView(v)}><Text style={styles.linkText}>Retake</Text></TouchableOpacity>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.primary} onPress={() => navigation.goBack()}><Text style={styles.primaryText}>Continue</Text></TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center' },
  centered: { alignItems: 'center' },
  segments: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  segment: { width: 56, height: 8, borderRadius: 4, backgroundColor: '#e0f2fe', overflow: 'hidden' },
  segmentFill: { height: '100%', backgroundColor: '#0ea5e9', borderRadius: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  bigTitle: { fontSize: 26, fontWeight: '800', color: '#111827', lineHeight: 32 },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 6, lineHeight: 20 },
  notice: { marginTop: 10, fontSize: 13, color: '#78350f', backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 12, padding: 10 },
  savedPill: { alignSelf: 'flex-start', marginTop: 10, fontSize: 12, fontWeight: '600', color: '#047857', backgroundColor: '#ecfdf5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, overflow: 'hidden' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, marginTop: 16 },
  figures: { flexDirection: 'row', justifyContent: 'space-around' },
  figureCol: { alignItems: 'center' },
  tag: { marginTop: 10, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden' },
  tagGood: { color: '#065f46', backgroundColor: '#d1fae5' },
  tagBad: { color: '#be123c', backgroundColor: '#ffe4e6' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  checkIcon: { width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  checkOk: { color: '#047857', backgroundColor: '#d1fae5' },
  checkNo: { color: '#e11d48', backgroundColor: '#ffe4e6' },
  checkText: { flex: 1, fontSize: 14, color: '#1f2937' },
  reassure: { fontSize: 13, color: '#4b5563', lineHeight: 19, marginTop: 16 },
  error: { color: '#be123c', backgroundColor: '#fff1f2', borderRadius: 12, padding: 10, fontSize: 13, marginTop: 14 },
  primary: { backgroundColor: '#0ea5e9', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  outline: { borderWidth: 2, borderColor: '#0ea5e9', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  outlineText: { color: '#0369a1', fontWeight: '700', fontSize: 16 },
  link: { alignItems: 'center', paddingVertical: 12 },
  linkText: { color: '#0369a1', fontWeight: '600', fontSize: 14, textAlign: 'center', marginTop: 4 },
  fine: { fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 16, lineHeight: 16 },
  preview: { width: 240, height: 320, borderRadius: 20, backgroundColor: '#f3f4f6', marginTop: 16, alignSelf: 'center' },
  checkingTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 14 },
  found: { backgroundColor: '#fffbeb', borderRadius: 16, padding: 14, marginTop: 14 },
  foundTitle: { fontWeight: '700', color: '#451a03', fontSize: 15 },
  foundItem: { color: '#451a03', fontSize: 15, marginTop: 6, lineHeight: 21 },
  reviewBox: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, padding: 14, marginTop: 14, alignItems: 'center' },
  reviewText: { fontSize: 13, color: '#4b5563', textAlign: 'center' },
  tick: { position: 'absolute', alignSelf: 'center', top: 136, width: 72, height: 72, borderRadius: 36, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  tickText: { color: '#fff', fontSize: 36, fontWeight: '700' },
  thumbs: { flexDirection: 'row', gap: 12, marginTop: 20 },
  thumbCol: { flex: 1, alignItems: 'center' },
  thumb: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#f3f4f6', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  thumbLabel: { marginTop: 8, fontSize: 13, fontWeight: '500', color: '#374151' },
});
