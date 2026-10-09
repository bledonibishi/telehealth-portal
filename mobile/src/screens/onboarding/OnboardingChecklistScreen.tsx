import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { MY_ONBOARDING, SUBMIT_ONBOARDING } from '../../graphql/onboarding';
import { ME_BASIC_INFO, MY_CONSULTATIONS, MY_TELEHEALTH_CONSENT } from '../../graphql/operations';
import { signOut } from '../../lib/session';
import { colors } from '../../theme';
import { identityHint, SUBMITTED_STATUSES, useIdentityVerification } from '../../lib/useIdentityVerification';
import { ErrorText } from '../../components/ui';
import { ErrorNotice } from '../../components/ErrorNotice';

// While the application is with a doctor, look again this often: the screen moves on by itself once they decide.
const REVIEW_POLL_MS = 15_000;

type StepKey = 'BasicInformation' | 'Consent' | 'MedicalQuestionnaire' | 'IdPhoto' | 'BodyPhoto' | 'PrescriptionProof';

const STEP_REJECTION_KEY: Partial<Record<StepKey, string>> = {
  IdPhoto: 'ID_PHOTO',
  BodyPhoto: 'BODY_PHOTO',
  PrescriptionProof: 'PRESCRIPTION_PROOF',
};

// A clinician's change request, shown on its step as theirs.
const clinicianNote = (reason?: string) => (reason ? `Clinician: “${reason}”` : undefined);

export function OnboardingChecklistScreen({ navigation }: any) {
  const { data, loading, error, refetch, startPolling, stopPolling } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const [submitOnboarding, { loading: submitting }] = useMutation(SUBMIT_ONBOARDING, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });
  const { data: meData, refetch: refetchMe } = useQuery(ME_BASIC_INFO, { fetchPolicy: 'network-only' });
  const { data: consultData, refetch: refetchConsults } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'network-only' });
  const { data: consentData, loading: consentLoading, refetch: refetchConsent } = useQuery(MY_TELEHEALTH_CONSENT, { fetchPolicy: 'network-only' });
  const { data: idvData, refetch: refetchIdv } = useIdentityVerification();
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);

  const o = data?.myOnboarding;

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchMe(), refetchConsults(), refetchIdv()]).catch(() => undefined);
    setRefreshing(false);
  };

  useEffect(() => {
    if (o?.status !== 'PENDING_REVIEW') return;
    startPolling(REVIEW_POLL_MS);
    return stopPolling;
  }, [o?.status, startPolling, stopPolling]);

  useEffect(() => {
    // Coming back from a step shows where things stand now.
    const unsubscribe = navigation.addListener('focus', () => { refetch(); refetchMe(); refetchConsults(); refetchConsent(); refetchIdv(); });
    return unsubscribe;
  }, [navigation, refetch, refetchMe, refetchConsults, refetchConsent, refetchIdv]);

  useEffect(() => {
    if (o?.status === 'APPROVED') {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }
  }, [o?.status, navigation]);

  if ((loading || consentLoading) && !o) return <ActivityIndicator style={styles.center} />;
  if (error && !o) return <View style={styles.errorBox}><ErrorNotice error={error} title="We couldn’t load your application" onRetry={() => refetch()} /></View>;
  if (!o) return null;

  // With the verification service the check happens on its own page: the step is done once the
  // photos are submitted there, whether or not a decision has been made yet.
  const idv = idvData?.myIdentityVerification;
  const idPhotoDone = idv?.configured ? SUBMITTED_STATUSES.includes(idv.status ?? '') : !!o.idDocumentUrl && !!o.selfieUrl;
  const bodyPhotoDone = !!o.bodyPhotoFrontUrl && !!o.bodyPhotoSideUrl;
  // Photos are saved one at a time, so a step can be half done: say which part is left.
  const idHave = [o.idDocumentUrl, o.selfieUrl].filter(Boolean).length;
  const bodyHave = [o.bodyPhotoFrontUrl, o.bodyPhotoSideUrl].filter(Boolean).length;
  const idHint = idHave === 1 ? (o.idDocumentUrl ? 'ID saved — your selfie is left' : 'Selfie saved — your ID is left') : 'A government ID and a selfie';
  const bodyHint = bodyHave === 1 ? (o.bodyPhotoFrontUrl ? 'Front photo saved — your side photo is left' : 'Side photo saved — your front photo is left') : 'Two full body photos, front and side';
  const retakeViews: string[] = o.bodyPhotosToRetake ?? [];

  const stepFeedback: { step: string; reason: string }[] = o.stepFeedback ?? [];
  // The questionnaire creates the consultation a doctor reviews.
  const consultations: { status: string; refundStatus?: string | null }[] = consultData?.myConsultations ?? [];
  const questionnaireDone = consultations.some((c) => c.status !== 'DECLINED');
  const questionnaireFeedback = consultations.some((c) => c.status === 'MORE_INFO_REQUESTED')
    ? 'A clinician has asked for more information — please review your answers'
    : undefined;
  const me = meData?.me;
  const basicDone = !!(me?.addressLine1 && me?.city && me?.postcode && me?.phone);

  // The proof is checked against the questionnaire's answers, so it comes after it.
  const prescriptionProofDone =
    questionnaireDone &&
    (o.priorMedicationUse === false || (!!o.priorMedicationUse && (!!o.prescriptionProofUrl || o.prescriptionProofUnavailable)));
  // Proof whose automatic check found mismatches blocks submitting until it's fixed or the patient
  // chooses to continue without proof, so it isn't done — it's marked as needing attention.
  const proofNeedsAttention =
    prescriptionProofDone &&
    !!o.priorMedicationUse &&
    !o.prescriptionProofUnavailable &&
    ['REUPLOAD', 'CONTACT_US'].includes(o.prescriptionProofReview?.nextStep);

  const feedbackFor = (key: StepKey) =>
    key === 'MedicalQuestionnaire'
      ? questionnaireFeedback
      : key === 'BodyPhoto' && retakeViews.length
      ? `Please retake your ${retakeViews.map((v) => (v === 'FRONT' ? 'front' : 'side')).join(' and ')} photo — it hasn’t passed our photo check`
      : clinicianNote(stepFeedback.find((f) => f.step === STEP_REJECTION_KEY[key])?.reason);

  const baseSteps: { key: StepKey; label: string; hint: string; done: boolean; attention?: boolean }[] = [
    { key: 'BasicInformation', label: 'Basic information', hint: 'Your details and where we send your treatment', done: basicDone },
    { key: 'Consent', label: 'Consent', hint: 'How your online consultation works', done: consentLoading || !!consentData?.myTelehealthConsent },
    { key: 'MedicalQuestionnaire', label: 'Medical questionnaire', hint: 'Your health, medicines and measurements', done: questionnaireDone },
    {
      key: 'IdPhoto',
      label: idv?.configured ? 'Verify your identity' : 'ID Photo',
      hint: idv?.configured ? identityHint(idv.status) : idHint,
      done: idPhotoDone,
    },
    { key: 'BodyPhoto', label: 'Full body photo', hint: bodyHint, done: bodyPhotoDone },
    {
      key: 'PrescriptionProof',
      label: 'Proof of prescription',
      hint: !questionnaireDone
        ? 'After your medical questionnaire'
        : o.prescriptionProofUnavailable
          ? 'No proof — you’ll start on the lowest dose'
          : proofNeedsAttention
            ? 'Details didn’t match — fix to submit'
            : 'Only if you’ve used this medication before',
      done: prescriptionProofDone && !proofNeedsAttention,
      attention: proofNeedsAttention,
    },
  ];

  // The medical questionnaire is answered on the website before paying, so it only appears here when it
  // still needs doing (an older account) or the clinician has asked for changes.
  const steps = baseSteps
    .map((s) => ({ ...s, rejectionReason: feedbackFor(s.key), needsChanges: !!feedbackFor(s.key) }))
    .filter((s) => !(s.key === 'MedicalQuestionnaire' && s.done && !s.needsChanges))
    // Proof of a previous prescription only matters for someone who has used the medicine: not shown otherwise.
    .filter((s) => !(s.key === 'PrescriptionProof' && o.priorMedicationUse === false))
    // Normally accepted on the website or in the questionnaire; it only appears for a patient an admin set up.
    .filter((s) => !(s.key === 'Consent' && s.done));

  const firstIncomplete = steps.find((s) => !s.done || s.needsChanges);
  const allDone = !firstIncomplete;

  // Declined: nothing is waiting for review any more, so say so rather than "Under review".
  if (o.status === 'DECLINED') {
    const refunded = consultations.some((c) => c.refundStatus === 'REFUNDED');
    return (
      <ScrollView contentContainerStyle={styles.pendingWrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View style={styles.pendingIcon}>
          <Text style={{ fontSize: 24 }}>✕</Text>
        </View>
        <Text style={styles.pendingTitle}>We can&rsquo;t offer this treatment</Text>
        <Text style={styles.pendingBody}>
          Your clinician has reviewed your application and decided it isn&rsquo;t safe to prescribe online. They&rsquo;ve sent you a message explaining why.
        </Text>
        {refunded && <Text style={styles.pendingMeta}>Your subscription has been cancelled and your payment refunded.</Text>}
        <TouchableOpacity style={styles.signOut} onPress={() => navigation.navigate('Chat')}>
          <Text style={styles.signOutText}>Read your clinician&rsquo;s message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (o.status === 'PENDING_REVIEW') {
    return (
      <ScrollView contentContainerStyle={styles.pendingWrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View style={styles.pendingIcon}>
          <Text style={{ fontSize: 24 }}>⏳</Text>
        </View>
        <Text style={styles.pendingTitle}>Under review</Text>
        <Text style={styles.pendingBody}>
          Thanks — your documents are with our clinical team. We&rsquo;ll notify you once they&rsquo;re reviewed, and this screen updates by itself.
        </Text>
        {o.submittedAt && <Text style={styles.pendingMeta}>Sent {new Date(o.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</Text>}
        <Text style={styles.pendingMeta}>Pull down to check now.</Text>
        <TouchableOpacity style={styles.signOut} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {o.status === 'REJECTED' && (
        <View style={styles.rejectedBox}>
          <Text style={styles.rejectedTitle}>Your submission needs another look</Text>
          <Text style={styles.rejectedBody}>See the steps below marked ! for what to fix.</Text>
        </View>
      )}

      <View style={styles.topRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>About 6 minutes</Text>
        </View>
        <TouchableOpacity style={styles.chatButton} onPress={() => navigation.navigate('Chat')} accessibilityLabel="Message us">
          <Text style={{ fontSize: 16 }}>💬</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>You&rsquo;re almost there</Text>
      <Text style={styles.subtitle}>We need a few final details to meet clinical and regulatory requirements.</Text>

      <Text style={styles.sectionLabel}>What&rsquo;s left</Text>

      <View style={styles.card}>
        {steps.map((s, i) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.row, i < steps.length - 1 && styles.rowBorder]}
            onPress={() => navigation.navigate(s.key)}
          >
            <View
              style={[
                styles.stepIcon,
                s.done && styles.stepIconDone,
                s.attention && styles.stepIconAttention,
                s.needsChanges && styles.stepIconRejected,
              ]}
            >
              <Text
                style={[
                  styles.stepIconText,
                  !s.done && styles.stepIconTextPending,
                  s.attention && styles.stepIconTextAttention,
                  s.needsChanges && styles.stepIconTextRejected,
                ]}
              >
                {s.needsChanges || s.attention ? '!' : s.done ? '✓' : i + 1}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepLabel}>{s.label}</Text>
              <Text style={[styles.stepHint, s.attention && styles.stepHintAttention, s.needsChanges && styles.stepHintRejected]}>
                {s.needsChanges ? s.rejectionReason : s.hint}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.footnote}>
        Your progress is saved as you go — you can leave and pick up where you stopped. Your data is encrypted, and a clinician reviews every application personally.
      </Text>

      <ErrorText error={submitError} />

      <TouchableOpacity
        style={[styles.cta, submitting && styles.ctaDisabled]}
        disabled={submitting}
        onPress={async () => {
          if (!allDone) return navigation.navigate(firstIncomplete!.key);
          setSubmitError(null);
          try {
            await submitOnboarding();
          } catch (err: any) {
            setSubmitError(err);
          }
        }}
      >
        <Text style={styles.ctaText}>{submitting ? 'Submitting…' : allDone ? 'Submit for review' : 'Resume'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Save and sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorBox: { padding: 16 },
  pendingWrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  pendingMeta: { fontSize: 12, color: '#9ca3af', marginTop: 10 },
  submitError: { color: '#be123c', backgroundColor: '#fff1f2', borderRadius: 12, padding: 10, fontSize: 13, marginTop: 16 },
  signOut: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  signOutText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
  pendingIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  pendingTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  pendingBody: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  rejectedBox: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#ffe4e6', borderRadius: 12, padding: 14, marginBottom: 16 },
  rejectedTitle: { color: '#f43f5e', fontWeight: '600', fontSize: 14 },
  rejectedBody: { color: '#f43f5e', fontSize: 13, marginTop: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  chatButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.brand100, backgroundColor: colors.brand50, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  pillText: { fontSize: 12, fontWeight: '600', color: colors.brand700 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 8, lineHeight: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 32, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  stepIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  stepIconDone: { backgroundColor: colors.brand50 },
  stepIconAttention: { backgroundColor: colors.amber50 },
  stepIconRejected: { backgroundColor: '#fff1f2' },
  stepIconText: { fontSize: 13, fontWeight: '600', color: colors.brand600 },
  stepIconTextAttention: { color: colors.amber700 },
  stepIconTextPending: { color: '#6b7280' },
  stepIconTextRejected: { color: '#f43f5e' },
  stepLabel: { fontSize: 14, fontWeight: '500', color: '#111827' },
  stepHint: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  stepHintAttention: { color: colors.amber700, fontWeight: '600' },
  stepHintRejected: { color: '#f43f5e', fontWeight: '600' },
  chevron: { fontSize: 20, color: '#d1d5db' },
  footnote: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 20 },
  cta: { backgroundColor: colors.brand600, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
