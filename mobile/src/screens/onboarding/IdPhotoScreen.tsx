import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useMutation } from '@apollo/client';
import * as WebBrowser from 'expo-web-browser';
import { PhotoUploadField } from '../../components/PhotoUploadField';
import { SAVE_IDENTITY_STEP, MY_ONBOARDING, START_IDENTITY_VERIFICATION } from '../../graphql/onboarding';
import { SUBMITTED_STATUSES, useIdentityVerification } from '../../lib/useIdentityVerification';
import { colors } from '../../theme';
import { ErrorText } from '../../components/ui';

/**
 * The ID step. With the verification service configured, the patient photographs their ID and takes
 * a selfie on the service's own page; otherwise they upload both here for a clinician to check.
 */
export function IdPhotoScreen({ navigation }: any) {
  const { data, loading, refetch } = useIdentityVerification();
  const idv = data?.myIdentityVerification;

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand600} />
      </View>
    );
  }
  if (idv?.configured) return <VerifiedIdentityStep status={idv.status ?? null} refetch={() => void refetch()} navigation={navigation} />;
  return <UploadedIdentityStep navigation={navigation} />;
}

/**
 * Identity check through the verification service, opened in an in-app browser (which has camera
 * access). The page reports the result to the backend by webhook; here the status is refreshed when
 * the browser closes, and polled while the check is still open. The link carries a one-time token,
 * so it is only kept in memory for this visit. Mirrors the web version.
 */
function VerifiedIdentityStep({ status, refetch, navigation }: { status: string | null; refetch: () => void; navigation: any }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [start, { loading }] = useMutation(START_IDENTITY_VERIFICATION);

  const openPage = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
    } finally {
      refetch();
    }
  };

  const begin = async () => {
    setError(null);
    try {
      const res = await start();
      const url: string = res.data.startIdentityVerification.hostedUrl;
      setLink(url);
      refetch();
      await openPage(url);
    } catch (err: any) {
      setError(err);
    }
  };

  const finished = !!status && SUBMITTED_STATUSES.includes(status);
  const canStart = !status || status === 'PENDING' || status === 'EXPIRED' || status === 'REJECTED';
  const reopen = !!link && status === 'PENDING';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Verify your identity</Text>
      <Text style={styles.subtitle}>This is legally required before we can prescribe and is only used for this verification.</Text>

      {status === 'REJECTED' && (
        <Text style={styles.rejected}>We couldn’t verify your identity. Please try again with clear photos of your ID card and yourself.</Text>
      )}
      {status === 'EXPIRED' && <Text style={styles.expired}>That link has expired. Start again to get a new one.</Text>}

      {finished ? (
        <View style={styles.doneCard}>
          <View style={styles.doneIcon}>
            <Text style={styles.doneIconText}>{status === 'APPROVED' ? '✓' : '⏳'}</Text>
          </View>
          <Text style={styles.doneTitle}>{status === 'APPROVED' ? 'Identity verified' : 'We’re checking your ID'}</Text>
          <Text style={styles.doneBody}>
            {status === 'APPROVED'
              ? 'You’re all set with this step.'
              : 'This can take a little while. You can carry on with the other steps — we’ll update this automatically.'}
          </Text>
          <TouchableOpacity style={[styles.cta, { alignSelf: 'stretch' }]} onPress={() => navigation.goBack()}>
            <Text style={styles.ctaText}>Continue</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Before you start</Text>
            <Text style={styles.infoItem}>✓ Have your Kosovo ID card ready</Text>
            <Text style={styles.infoItem}>✓ Find a well-lit spot for your selfie</Text>
          </View>

          {reopen && (
            <Text style={styles.note}>Finish the check on the verification page, then come back here. We’ll update this as soon as you’re done.</Text>
          )}
          <ErrorText error={error} />

          {canStart && (
            <TouchableOpacity
              style={[styles.cta, loading && styles.ctaDisabled]}
              disabled={loading}
              onPress={reopen ? () => void openPage(link!) : begin}
            >
              <Text style={styles.ctaText}>
                {loading ? 'Opening…' : reopen ? 'Open the verification page again' : status === 'REJECTED' || status === 'EXPIRED' ? 'Try again' : 'Start verification'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** The in-app upload of an ID and a selfie, reviewed by a clinician. */
function UploadedIdentityStep({ navigation }: { navigation: any }) {
  const [idDocumentFileId, setIdDocumentFileId] = useState<string | null>(null);
  const [selfieFileId, setSelfieFileId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [saveIdentityStep, { loading }] = useMutation(SAVE_IDENTITY_STEP, {
    refetchQueries: [{ query: MY_ONBOARDING }],
  });

  const canContinue = !!idDocumentFileId && !!selfieFileId;

  const handleContinue = async () => {
    if (!canContinue) return;
    setError(null);
    try {
      await saveIdentityStep({ variables: { input: { idDocumentFileId, selfieFileId } } });
      navigation.goBack();
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Verify your identity</Text>
      <Text style={styles.subtitle}>
        This is legally required before we can prescribe and is only used for this verification.
      </Text>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Before you start</Text>
        <Text style={styles.infoItem}>✓ Have a valid ID ready (e.g. passport, driving licence)</Text>
        <Text style={styles.infoItem}>✓ Find a well-lit spot for your selfie</Text>
      </View>

      <View style={{ gap: 16 }}>
        <PhotoUploadField
          kind="ID_DOCUMENT"
          label="Government ID"
          hint="Passport or driving licence, all corners visible"
          onUploaded={setIdDocumentFileId}
        />
        <PhotoUploadField kind="SELFIE" label="Selfie" hint="Look directly at the camera" onUploaded={setSelfieFileId} />
      </View>

      <ErrorText error={error} />

      <TouchableOpacity
        style={[styles.cta, (!canContinue || loading) && styles.ctaDisabled]}
        disabled={!canContinue || loading}
        onPress={handleContinue}
      >
        <Text style={styles.ctaText}>{loading ? 'Saving…' : 'Continue'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  rejected: { marginTop: 16, fontSize: 13, color: '#be123c', backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#ffe4e6', borderRadius: 12, padding: 12, lineHeight: 18 },
  expired: { marginTop: 16, fontSize: 13, color: colors.slate600, backgroundColor: colors.slate100, borderRadius: 12, padding: 12 },
  note: { fontSize: 12, color: colors.slate500, marginTop: 4, lineHeight: 17 },
  doneCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.slate100, padding: 20, marginTop: 24, alignItems: 'center' },
  doneIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  doneIconText: { fontSize: 20, color: colors.brand600 },
  doneTitle: { fontSize: 15, fontWeight: '600', color: colors.slate900 },
  doneBody: { fontSize: 12, color: colors.slate500, marginTop: 4, textAlign: 'center', lineHeight: 17 },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 8, lineHeight: 20 },
  infoBox: { backgroundColor: '#f0fdf9', borderWidth: 1, borderColor: '#ccfbef', borderRadius: 14, padding: 14, marginTop: 20, marginBottom: 20 },
  infoTitle: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 },
  infoItem: { fontSize: 12, color: '#374151', marginTop: 4 },
  error: { color: '#f43f5e', fontSize: 13, marginTop: 12 },
  cta: { backgroundColor: '#0d9488', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
