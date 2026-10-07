import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';

// Smooth open/close of folded sections on Android too.
if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
import { useMutation, useQuery } from '@apollo/client';
import { PhotoUploadField } from '../../components/PhotoUploadField';
import { ProofSampleSlider } from '../../components/proof/ProofSampleSlider';
import { ProofSample } from '../../components/proof/ProofSample';
import { ProofRequirements } from '../../components/proof/ProofRequirements';
import {
  ChecklistLoader,
  DoseChoice,
  DoseQuestion,
  NAME_EVIDENCE_STEPS,
  PROOF_STEPS,
  ProofCheck,
  ProofChecklist,
} from '../../components/proof/ProofReview';
import {
  CLARIFY_PRESCRIPTION_DOSE,
  DECLARE_PRESCRIPTION_PROOF_UNAVAILABLE,
  MY_ONBOARDING,
  SAVE_PRESCRIPTION_NAME_EVIDENCE,
  SAVE_PRESCRIPTION_PROOF_STEP,
  SAVE_PRIOR_MEDICATION_USE,
} from '../../graphql/onboarding';
import { MY_CONSULTATIONS } from '../../graphql/operations';
import { colors } from '../../theme';

// The same flow as the web portal's proof-of-prescription step (web/src/app/onboarding/prescription-proof).

const PROOF_TYPES: { value: string; label: string; hint: string; fastest?: boolean }[] = [
  { value: 'MEDICINE_BOX_LABEL', label: 'Medicine box label', hint: 'Pharmacy sticker on your box, bottle, or pen', fastest: true },
  { value: 'PRESCRIPTION_DOCUMENT', label: 'Prescription document', hint: 'Prescription or notification issued by your GP' },
  { value: 'PHARMACY_RECORD', label: 'Pharmacy record', hint: 'Dispensing records, repeat medication lists, or medication history' },
  { value: 'ORDER_CONFIRMATION', label: 'Order confirmation', hint: 'Confirmation email or receipt from a previous order' },
];

type ProofReview = {
  status: string;
  riskLevel: 'OK' | 'UNVERIFIED' | 'CAUTION' | 'HIGH';
  patientMessage: string;
  documentIssues: { code: string; patientHint: string }[];
  checks: ProofCheck[];
  doseMg?: number | null;
  reportedDoseLabel?: string | null;
  failedAttempts: number;
  nextStep: 'NONE' | 'REUPLOAD' | 'CONTACT_US';
};

const REVIEW_STYLE: Record<ProofReview['riskLevel'], { icon: string; title: string; bg: string; border: string; fg: string; iconBg: string }> = {
  OK: { icon: '✓', title: 'Document checked', bg: colors.brand50, border: colors.brand100, fg: colors.slate700, iconBg: colors.brand100 },
  UNVERIFIED: { icon: 'i', title: 'A clinician will check your document', bg: colors.slate50, border: colors.slate200, fg: colors.slate700, iconBg: colors.slate200 },
  CAUTION: { icon: '!', title: 'Please read before you continue', bg: colors.amber50, border: colors.amber200, fg: colors.amber900, iconBg: colors.amber100 },
  HIGH: { icon: '!', title: 'Your dose may need to change', bg: colors.red50, border: colors.red200, fg: colors.red800, iconBg: colors.red100 },
};

const PROOF_HELP_DRAFT =
  'Hi, I’m having trouble with my proof of prescription — the details on my document didn’t match after a couple of tries. Could you help?';
const NO_PROOF_DRAFT = 'Hi, I’ve used this medication before but I don’t have proof of my prescription. What can I do?';

/** Each state of the screen fades and slides up into place as it appears. */
function Appear({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** A row that opens to show more, and folds away again — keeps the main choice on screen. */
function Disclosure({ title, tone = 'plain', children }: { title: string; tone?: 'plain' | 'rose'; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.timing(turn, { toValue: open ? 0 : 1, duration: 200, useNativeDriver: true }).start();
    setOpen(!open);
  };
  const rose = tone === 'rose';
  return (
    <View style={[styles.details, rose && styles.detailsRose]}>
      <Pressable onPress={toggle} style={styles.detailsHeader} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={[styles.detailsTitle, rose && { color: '#881337' }]}>{title}</Text>
        <Animated.Text
          style={[styles.detailsChevron, rose && { color: '#fb7185' }, { transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }]}
        >
          ›
        </Animated.Text>
      </Pressable>
      {open && <View style={[styles.detailsBody, rose && { borderTopColor: '#ffe4e6' }]}>{children}</View>}
    </View>
  );
}

/** "What happens if I don't have proof?" */
function WithoutProofDetails() {
  return (
    <Disclosure title="What happens if I don’t have proof?">
      {[
        ['💉', 'You’ll start on the lowest dose', 'The same as someone new to this medicine, while your body adjusts.'],
        ['📈', 'Any increase is your clinician’s decision', 'They review your dose at each monthly check-in and only increase it if it suits you — never sooner than 4 weeks.'],
        ['📄', 'Found your proof later?', 'Upload it any time before your clinician decides, and they may continue you at your previous dose.'],
      ].map(([icon, title, body]) => (
        <View key={title} style={styles.meaningRow}>
          <Text style={{ fontSize: 16 }}>{icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.meaningTitle}>{title}</Text>
            <Text style={styles.meaningBody}>{body}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.meaningBody}>
        Proof can be an old box or pen with the pharmacy label, your medication history from your GP practice or pharmacy, or the
        order email from your previous provider.
      </Text>
    </Disclosure>
  );
}

function Button({ label, onPress, kind = 'primary', disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'link'; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles[kind], disabled && { opacity: 0.4 }, pressed && !disabled && { opacity: 0.85 }]}
    >
      <Text style={styles[`${kind}Text` as const]}>{label}</Text>
    </Pressable>
  );
}

export function PrescriptionProofScreen({ navigation }: any) {
  const { data, loading: loadingOnboarding } = useQuery(MY_ONBOARDING, { fetchPolicy: 'network-only' });
  const o = data?.myOnboarding;
  // The medical questionnaire creates the consultation; it's where the patient says which medicine
  // and dose they used and when, which is what the proof is checked against.
  const { data: consultationsData, loading: loadingConsultations } = useQuery(MY_CONSULTATIONS, { fetchPolicy: 'network-only' });
  const questionnaireDone = ((consultationsData?.myConsultations ?? []) as { status: string }[]).some((c) => c.status !== 'DECLINED');

  const [priorUse, setPriorUse] = useState<boolean | null>(null);
  const [proofType, setProofType] = useState<string | null>(null);
  const [proofFileId, setProofFileId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [review, setReview] = useState<ProofReview | null>(null);
  const [dismissedReview, setDismissedReview] = useState(false);
  const [uploadingNameEvidence, setUploadingNameEvidence] = useState(false);
  const [nameEvidenceFileId, setNameEvidenceFileId] = useState<string | null>(null);
  const [askingNoProof, setAskingNoProof] = useState(false);
  const [foundProof, setFoundProof] = useState(false);
  // On the upload step (after choosing a document type, or after a check's result).
  const [uploadStep, setUploadStep] = useState(false);
  const [fromResult, setFromResult] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  // After a photo is uploaded the examples fold away, so the photo and Continue are on screen.
  const [showExamples, setShowExamples] = useState(false);

  const refetch = { refetchQueries: [{ query: MY_ONBOARDING }] };
  const [savePriorMedicationUse, { loading: savingPriorUse }] = useMutation(SAVE_PRIOR_MEDICATION_USE, refetch);
  const [savePrescriptionProofStep, { loading: savingProof }] = useMutation(SAVE_PRESCRIPTION_PROOF_STEP, refetch);
  const [saveNameEvidence, { loading: savingNameEvidence }] = useMutation(SAVE_PRESCRIPTION_NAME_EVIDENCE, refetch);
  const [clarifyDose, { loading: savingDoseAnswer }] = useMutation(CLARIFY_PRESCRIPTION_DOSE, refetch);
  const [declareNoProof, { loading: savingNoProof }] = useMutation(DECLARE_PRESCRIPTION_PROOF_UNAVAILABLE, refetch);

  const effectivePriorUse = priorUse ?? o?.priorMedicationUse ?? null;
  const fail = (err: any) => setError(err?.message ?? 'Something went wrong');
  const openChat = (draft?: string) => navigation.navigate('Chat', { draft });

  if (loadingOnboarding || loadingConsultations) return <ActivityIndicator style={styles.center} color={colors.brand600} />;

  const showReview = (result: ProofReview) => {
    setReview(result);
    setDismissedReview(false);
    setUploadStep(false);
    setUploadingNameEvidence(false);
    setNameEvidenceFileId(null);
  };

  const handleYes = async () => {
    setError('');
    setPriorUse(true);
    await savePriorMedicationUse({ variables: { priorMedicationUse: true } }).catch(fail);
  };

  const handleNo = async () => {
    setError('');
    try {
      await savePriorMedicationUse({ variables: { priorMedicationUse: false } });
      navigation.goBack();
    } catch (err) {
      fail(err);
    }
  };

  const handleContinue = async () => {
    if (!proofType || !proofFileId) return;
    setError('');
    try {
      const { data: saved } = await savePrescriptionProofStep({
        variables: { input: { prescriptionProofType: proofType, prescriptionProofFileId: proofFileId } },
      });
      const result: ProofReview | null = saved?.savePrescriptionProofStep?.prescriptionProofReview ?? null;
      if (result) showReview(result);
      else navigation.goBack();
    } catch (err) {
      fail(err);
    }
  };

  const handleNameEvidence = async () => {
    if (!nameEvidenceFileId) return;
    setError('');
    try {
      const { data: saved } = await saveNameEvidence({ variables: { fileId: nameEvidenceFileId } });
      const result: ProofReview | null = saved?.savePrescriptionNameEvidence?.prescriptionProofReview ?? null;
      if (result) showReview(result);
      else navigation.goBack();
    } catch (err) {
      fail(err);
    }
  };

  const handleDoseAnswer = async (choice: DoseChoice) => {
    setError('');
    try {
      const { data: saved } = await clarifyDose({ variables: { choice } });
      const result: ProofReview | null = saved?.clarifyPrescriptionDose?.prescriptionProofReview ?? null;
      if (result) showReview(result);
    } catch (err) {
      fail(err);
    }
  };

  const chooseType = (type: string) => {
    setProofType(type);
    setProofFileId(null);
    setShowExamples(false);
    setFromResult(false);
    setUploadStep(true);
    setUploadKey((k) => k + 1);
  };

  const uploadAgain = () => {
    setReview(null);
    setDismissedReview(true);
    setUploadingNameEvidence(false);
    setProofFileId(null);
    setProofType(o?.prescriptionProofType ?? null);
    setUploadStep(!!o?.prescriptionProofType);
    setFromResult(true);
    setUploadKey((k) => k + 1);
  };

  const backToResult = () => {
    setUploadStep(false);
    setDismissedReview(false);
  };

  // Coming back to this step with unresolved issues shows them again first.
  const savedReview: ProofReview | null = o?.prescriptionProofReview ?? null;
  const shownReview = review ?? (!dismissedReview && savedReview && savedReview.nextStep !== 'NONE' ? savedReview : null);

  // A change the clinician asked for on this step. Shown at the top of the step until the
  // patient acts on it (uploading proof, or confirming they have none, clears it).
  const clinicianRequest: string | undefined = (o?.stepFeedback ?? []).find((f: { step: string }) => f.step === 'PRESCRIPTION_PROOF')?.reason;
  // What didn't match on the last upload, for "Why your clinician asked for this".
  const lastFailures = ((o?.prescriptionProofReview?.checks ?? []) as ProofCheck[]).filter((c) => c.status === 'FAIL');
  const CHECK_NAME: Record<string, string> = { NAME: 'Name', MEDICINE: 'Medicine', DOSE: 'Dose', DATE: 'Date' };
  const clinicianCard = clinicianRequest ? (
    <Disclosure title="Why your clinician asked for this" tone="rose">
      <View>
        <Text style={styles.whyLabel}>Your clinician’s note</Text>
        <Text style={styles.whyNote}>“{clinicianRequest}”</Text>
      </View>
      {(lastFailures.length > 0 || o?.prescriptionProofUnavailable) && (
        <View>
          <Text style={styles.whyLabel}>What didn’t match last time</Text>
          {o?.prescriptionProofUnavailable && <Text style={styles.whyItem}>You told us you don’t have proof.</Text>}
          {lastFailures.map((c) => (
            <Text key={c.key} style={styles.whyItem}>
              <Text style={{ fontWeight: '600', color: colors.slate900 }}>{CHECK_NAME[c.key]}:</Text> {c.value ?? 'Not found'}
              {!!c.hint && <Text style={{ color: colors.slate500 }}> · {c.hint}</Text>}
            </Text>
          ))}
        </View>
      )}
      <Text style={styles.clinicianLink} onPress={() => openChat(`Hi, about your request on my proof of prescription (“${clinicianRequest}”): `)}>
        Message your clinician →
      </Text>
    </Disclosure>
  ) : null;

  const page = (key: string, children: React.ReactNode) => (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Appear key={key}>{children}</Appear>
    </ScrollView>
  );
  const errorText = !!error && <Text style={styles.error}>{error}</Text>;

  // ── Reading the document ──────────────────────────────────────────────────
  if (savingProof) return page('loading', <ChecklistLoader title="Checking your document" steps={PROOF_STEPS} />);
  if (savingNameEvidence) return page('loading-name', <ChecklistLoader title="Checking your name change" steps={NAME_EVIDENCE_STEPS} />);

  // ── "I don't have any proof" ──────────────────────────────────────────────
  if (askingNoProof) {
    return page(
      'no-proof',
      <>
        <Text style={styles.title}>Don’t have any proof?</Text>
        <Text style={styles.subtitle}>
          You can carry on without it. For your safety, you’ll then start on the lowest dose, the same as someone new to this
          medicine. Your clinician reviews your dose at each monthly check-in, and may still be able to confirm your previous dose
          another way.
        </Text>
        <View style={[styles.card, { padding: 16, marginTop: 20 }]}>
          <Text style={styles.cardTitle}>Before you decide, any of these works as proof:</Text>
          {[
            'An old box or pen with the pharmacy label still on it',
            'Your medication history from your GP practice or pharmacy (many have an app or can print it)',
            'The order confirmation email from the clinic or pharmacy you used before',
          ].map((t) => (
            <Text key={t} style={styles.bullet}>
              •  {t}
            </Text>
          ))}
        </View>
        {errorText}
        <View style={styles.actions}>
          <Button
            label={savingNoProof ? 'Saving…' : 'Continue without proof'}
            disabled={savingNoProof}
            onPress={async () => {
              setError('');
              try {
                await declareNoProof();
                setAskingNoProof(false);
                navigation.goBack();
              } catch (err) {
                fail(err);
              }
            }}
          />
          <Button label="I’ll find my proof" kind="secondary" onPress={() => setAskingNoProof(false)} />
          <Button label="Not sure? Message our team" kind="link" onPress={() => openChat(NO_PROOF_DRAFT)} />
        </View>
      </>,
    );
  }

  if (o?.prescriptionProofUnavailable && !foundProof) {
    const uploadProof = () => {
      setFoundProof(true);
      setDismissedReview(true);
    };
    return page(
      `continuing-without-${!!clinicianRequest}`,
      <>
        <Text style={styles.title}>
          {clinicianRequest ? 'Your clinician needs more on your prescription' : 'Continuing without proof'}
        </Text>
        <Text style={[styles.subtitle, { marginTop: 6 }]}>
          {clinicianRequest
            ? 'Please upload proof if you can, or let us know you still don’t have any.'
            : 'You’ll start like someone new to this medicine. Found proof? Upload it any time.'}
        </Text>

        {o?.proofRequirements && <ProofRequirements data={o.proofRequirements} compact />}

        {errorText}
        <View style={styles.actions}>
          {clinicianRequest ? (
            <>
              <Button label="Upload proof" onPress={uploadProof} />
              <Button
                label={savingNoProof ? 'Saving…' : 'I still don’t have any proof'}
                kind="secondary"
                disabled={savingNoProof}
                onPress={async () => {
                  setError('');
                  try {
                    await declareNoProof();
                    navigation.goBack();
                  } catch (err) {
                    fail(err);
                  }
                }}
              />
            </>
          ) : (
            <>
              <Button label="Continue" onPress={() => navigation.goBack()} />
              <Button label="I found my proof — upload it" kind="secondary" onPress={uploadProof} />
            </>
          )}
        </View>
        {clinicianCard}
        <WithoutProofDetails />
      </>,
    );
  }

  // ── Name-change document ──────────────────────────────────────────────────
  if (shownReview && uploadingNameEvidence) {
    return page(
      'name-evidence',
      <>
        <Text style={styles.title}>Proof of your name change</Text>
        <Text style={styles.subtitle}>
          Upload a document that shows both your previous name and your current name, such as a marriage or civil partnership
          certificate, a deed poll, or a change-of-name declaration.
        </Text>
        <View style={{ marginTop: 20 }}>
          <PhotoUploadField key={`name-${uploadKey}`} kind="PRESCRIPTION_PROOF" label="Upload document" onUploaded={setNameEvidenceFileId} />
        </View>
        {errorText}
        <View style={styles.actions}>
          <Button label="Continue" disabled={!nameEvidenceFileId} onPress={handleNameEvidence} />
          <Button label="Back" kind="link" onPress={() => setUploadingNameEvidence(false)} />
        </View>
      </>,
    );
  }

  // ── The check's result ────────────────────────────────────────────────────
  if (shownReview) {
    const r = shownReview;
    const style = REVIEW_STYLE[r.riskLevel] ?? REVIEW_STYLE.UNVERIFIED;
    const issues = r.documentIssues ?? [];
    const checks = r.checks ?? [];
    const nameMismatch = issues.some((i) => i.code === 'NAME_MISMATCH');
    // Problems with the document as a whole (unreadable, wrong kind of document) have no checklist line.
    const otherIssues = checks.length ? issues.filter((i) => !/^(NAME|MEDICINE|DOSE|DATE)_/.test(i.code)) : issues;
    const askDose = issues.some((i) => i.code === 'DOSE_MISMATCH') && r.doseMg != null && !!r.reportedDoseLabel;

    return page(
      `result-${r.nextStep}`,
      <>
        <Text style={styles.title}>
          {r.nextStep === 'CONTACT_US' ? 'Let’s sort this out together' : issues.length ? 'Some details need another look' : 'Thanks for your proof'}
        </Text>
        {clinicianCard}

        {/* The one thing to answer comes first, above the checklist. */}
        {askDose && (
          <DoseQuestion documentMg={r.doseMg!} reportedDose={r.reportedDoseLabel!} saving={savingDoseAnswer} onAnswer={handleDoseAnswer} />
        )}

        {checks.length > 0 && <ProofChecklist checks={checks} />}

        {otherIssues.length > 0 && (
          <View style={[styles.card, { marginTop: 20, borderColor: colors.amber200 }]}>
            {otherIssues.map((i, idx) => (
              <Text key={i.code} style={[styles.issue, idx > 0 && styles.divider]}>
                {i.patientHint}
              </Text>
            ))}
          </View>
        )}
        {errorText}

        {/* Empty when the document's issues are the whole story. */}
        {!!r.patientMessage && (
          <View style={[styles.message, { backgroundColor: style.bg, borderColor: style.border }]}>
            <View style={[styles.messageIcon, { backgroundColor: style.iconBg }]}>
              <Text style={[styles.messageIconText, { color: style.fg }]}>{style.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.messageTitle, { color: style.fg }]}>{style.title}</Text>
              <Text style={[styles.messageBody, { color: style.fg }]}>{r.patientMessage}</Text>
            </View>
          </View>
        )}

        {r.nextStep === 'REUPLOAD' && (
          <View style={styles.actions}>
            {nameMismatch && (
              <Button
                label="Upload proof of name change"
                onPress={() => {
                  setUploadingNameEvidence(true);
                  setUploadKey((k) => k + 1);
                }}
              />
            )}
            <Button
              label={nameMismatch ? 'Upload a document in my current name' : 'Upload a different document'}
              kind={nameMismatch ? 'secondary' : 'primary'}
              onPress={uploadAgain}
            />
            <Button label="Continue without proof" kind="link" onPress={() => setAskingNoProof(true)} />
          </View>
        )}

        {r.nextStep === 'CONTACT_US' && (
          <>
            <Text style={[styles.subtitle, { marginTop: 20 }]}>Still not matching? Our team can help — or continue without proof and start on the lowest dose.</Text>
            <View style={styles.actions}>
              <Button label="Message our team" onPress={() => openChat(PROOF_HELP_DRAFT)} />
              <Button label="Try another document" kind="secondary" onPress={uploadAgain} />
              <Button label="Continue without proof" kind="link" onPress={() => setAskingNoProof(true)} />
            </View>
          </>
        )}

        {r.nextStep === 'NONE' && (
          <View style={styles.actions}>
            <Button label="Continue" onPress={() => navigation.goBack()} />
            {r.riskLevel !== 'OK' && <Button label="Upload a different document" kind="secondary" onPress={uploadAgain} />}
          </View>
        )}
      </>,
    );
  }

  // ── Before the questionnaire / no proof needed / first question ───────────
  if (!questionnaireDone) {
    return page(
      'questionnaire-first',
      <>
        <Text style={styles.title}>First, your medical questionnaire</Text>
        <Text style={styles.subtitle}>
          In the questionnaire you tell us which medicine you used before, your dose and when you last took it. We check your
          proof against those answers, so please complete it first.
        </Text>
        <View style={styles.actions}>
          <Button label="Go to the medical questionnaire" onPress={() => navigation.navigate('MedicalQuestionnaire')} />
        </View>
      </>,
    );
  }

  if (effectivePriorUse === false) {
    return page(
      'not-needed',
      <>
        <Text style={styles.title}>No proof needed</Text>
        <Text style={styles.subtitle}>
          You told us this is your first time using this medication, so there’s nothing to upload. Your clinician will start you
          on the lowest dose.
        </Text>
        {errorText}
        <View style={styles.actions}>
          <Button label="Continue" onPress={() => navigation.goBack()} />
          <Button label="Actually, I have used it before" kind="secondary" disabled={savingPriorUse} onPress={handleYes} />
        </View>
      </>,
    );
  }

  if (effectivePriorUse === null) {
    return page(
      'prior-use',
      <>
        <Text style={styles.title}>Have you used this medication before?</Text>
        <Text style={styles.subtitle}>If you have an existing prescription, we can verify your dose without repeating the full clinical review.</Text>
        {errorText}
        <View style={styles.actions}>
          <Button label="Yes, I have a current prescription" kind="secondary" disabled={savingPriorUse} onPress={handleYes} />
          <Button label="No, this is my first time" kind="secondary" disabled={savingPriorUse} onPress={handleNo} />
        </View>
      </>,
    );
  }

  // ── Step 2: examples and the upload ───────────────────────────────────────
  const chosenType = PROOF_TYPES.find((t) => t.value === proofType);
  if (uploadStep && chosenType) {
    // What didn't match on the previous upload, highlighted in the examples.
    const flaggedLastTime = fromResult ? ((savedReview?.checks ?? []) as ProofCheck[]).filter((c) => c.status !== 'PASS').map((c) => c.key) : [];
    return page(
      `upload-${chosenType.value}-${fromResult}`,
      <>
        <Text style={styles.title}>{fromResult ? 'Upload a new document' : `Upload your ${chosenType.label.toLowerCase()}`}</Text>
        <Text style={[styles.subtitle, { marginTop: 4 }]}>Make sure your name, medicine, dose and date are readable.</Text>
        {clinicianCard}
        <Text style={styles.docLine}>
          Document: <Text style={{ fontWeight: '600', color: colors.slate900 }}>{chosenType.label}</Text>
          <Text style={{ color: colors.slate300 }}>  ·  </Text>
          <Text style={styles.inlineLink} onPress={() => setUploadStep(false)}>
            Change
          </Text>
        </Text>

        {o?.proofRequirements && <ProofRequirements data={o.proofRequirements} compact />}

        {!proofFileId || showExamples ? (
          chosenType.value === 'MEDICINE_BOX_LABEL' ? (
            <ProofSampleSlider flagged={flaggedLastTime} />
          ) : (
            <ProofSample type={chosenType.value} flagged={flaggedLastTime} />
          )
        ) : (
          <Text style={[styles.inlineLink, { marginTop: 12 }]} onPress={() => setShowExamples(true)}>
            Show examples
          </Text>
        )}

        <View style={{ marginTop: 12 }}>
          <PhotoUploadField
            key={`proof-${uploadKey}`}
            kind="PRESCRIPTION_PROOF"
            label="Your proof"
            buttonLabel="Take or upload a photo"
            onUploaded={(id) => {
              setProofFileId(id);
              setShowExamples(false);
            }}
          />
        </View>
        {errorText}
        <View style={[styles.actions, { marginTop: 12 }]}>
          <Button label="Continue" disabled={!proofFileId} onPress={handleContinue} />
          <Button label="I don’t have any proof" kind="link" onPress={() => setAskingNoProof(true)} />
          <Button label="Back" kind="link" onPress={fromResult ? backToResult : () => setUploadStep(false)} />
        </View>
      </>,
    );
  }

  // ── Step 1: which kind of proof ───────────────────────────────────────────
  return page(
    'types',
    <>
      <Text style={styles.title}>What proof do you have?</Text>
      <Text style={styles.subtitle}>We need to verify your current prescription so you can continue at the right dose. Choose the one you have to hand.</Text>
      {clinicianCard}
      <View style={{ gap: 8, marginTop: 20 }}>
        {PROOF_TYPES.map((t) => {
          const selected = proofType === t.value;
          return (
            <Pressable key={t.value} style={[styles.typeOption, selected && styles.typeOptionSelected]} onPress={() => chooseType(t.value)} accessibilityRole="button">
              <View style={[styles.radio, selected && styles.radioSelected]} />
              <View style={{ flex: 1 }}>
                <View style={styles.typeHeader}>
                  <Text style={styles.typeLabel}>{t.label}</Text>
                  {t.fastest && (
                    <View style={styles.fastest}>
                      <Text style={styles.fastestText}>FASTEST TO VERIFY</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.typeHint}>{t.hint}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ alignItems: 'flex-start', marginTop: 4 }}>
        <Button label="I don’t have any proof" kind="link" onPress={() => setAskingNoProof(true)} />
      </View>
      {errorText}
    </>,
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.page },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.slate900 },
  subtitle: { fontSize: 14, color: colors.slate500, marginTop: 8, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 13, marginTop: 12 },
  card: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.slate100 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.slate900, marginBottom: 8 },
  bullet: { fontSize: 14, color: colors.slate600, lineHeight: 20, marginTop: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.slate100 },
  issue: { fontSize: 14, color: colors.amber900, lineHeight: 20, paddingHorizontal: 16, paddingVertical: 12 },
  actions: { gap: 10, marginTop: 24 },
  primary: { backgroundColor: colors.brand600, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  secondary: { borderWidth: 1, borderColor: colors.slate200, backgroundColor: colors.white, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: colors.slate700, fontWeight: '600', fontSize: 14 },
  link: { paddingVertical: 8, alignItems: 'center' },
  linkText: { color: colors.slate500, fontSize: 14, fontWeight: '500' },
  message: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 20 },
  messageIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  messageIconText: { fontSize: 12, fontWeight: '700' },
  messageTitle: { fontSize: 14, fontWeight: '700' },
  messageBody: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  docLine: { fontSize: 14, color: colors.slate600, marginTop: 12 },
  inlineLink: { color: colors.brand700, fontWeight: '600' },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.slate200, borderRadius: 14, padding: 14, backgroundColor: colors.white },
  typeOptionSelected: { borderColor: colors.brand500, backgroundColor: colors.brand50 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.slate300 },
  radioSelected: { borderColor: colors.brand600, backgroundColor: colors.brand600 },
  typeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typeLabel: { fontSize: 14, fontWeight: '500', color: colors.slate900 },
  typeHint: { fontSize: 12, color: colors.slate400, marginTop: 2 },
  fastest: { backgroundColor: colors.brand100, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  fastestText: { fontSize: 9, fontWeight: '700', color: colors.brand700 },
  chevron: { fontSize: 20, color: colors.slate300 },
  detailsRose: { borderColor: '#fecdd3', backgroundColor: '#fff1f2' },
  whyLabel: { fontSize: 12, fontWeight: '700', color: '#be123c' },
  whyNote: { fontSize: 14, color: '#881337', marginTop: 2 },
  whyItem: { fontSize: 13, color: colors.slate700, marginTop: 4, lineHeight: 18 },
  clinicianLink: { fontSize: 14, fontWeight: '600', color: '#be123c' },
  details: { marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.slate100, backgroundColor: colors.white },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  detailsTitle: { fontSize: 14, fontWeight: '500', color: colors.slate700 },
  detailsChevron: { fontSize: 18, color: colors.slate400 },
  detailsBody: { borderTopWidth: 1, borderTopColor: colors.slate100, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  meaningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  meaningTitle: { fontSize: 14, fontWeight: '600', color: colors.slate900 },
  meaningBody: { fontSize: 12, color: colors.slate500, marginTop: 2, lineHeight: 17 },
});
