'use client';

import { useState } from 'react';
import { useLazyQuery, useMutation, useQuery } from '@apollo/client';
import { Modal } from '@/components/consultation/Modal';
import { ORDER_PARTNER_PAYLOAD, PARTNER_INTEGRATION_STATUS, SEND_ORDER_TO_PARTNER } from '@/graphql/orders';
import { useI18n } from '@/lib/i18n/I18nProvider';
import { InlineError } from '@/components/ui/Alert';

/**
 * Where an order stands with the external pharmacy: sent, failed (with the reason), or waiting.
 * Also shows the exact structured payload, to copy by hand when the partner has no automatic channel.
 */
export default function PartnerStatus({ order }: { order: any }) {
  const { t, timeAgo } = useI18n();
  const [showPayload, setShowPayload] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const { data: integration } = useQuery(PARTNER_INTEGRATION_STATUS);
  const status = integration?.partnerIntegrationStatus;
  const automatic = !!status && (status.webhookConfigured || status.emailConfigured);
  const partner = status?.partnerName || t('the pharmacy partner');

  const [loadPayload, { data: payloadData, loading: loadingPayload }] = useLazyQuery(ORDER_PARTNER_PAYLOAD, { fetchPolicy: 'network-only' });
  const [send, { loading: sending }] = useMutation(SEND_ORDER_TO_PARTNER, {
    onError: (e) => setError(e),
    onCompleted: () => setError(null),
  });

  const tx = order.partnerTransmission;
  const waiting = order.status === 'PENDING';
  // After a cancellation the record is about telling the partner not to dispatch.
  const withdrawing = tx?.event === 'order.cancelled';
  // Dispatched or cancelled orders are the pharmacy's now — only show whether it went through.
  if (!waiting && !tx) return null;

  let chip: { cls: string; text: string };
  if (withdrawing) {
    if (tx.status === 'SENT') chip = { cls: 'bg-green-50 text-green-700', text: t('{partner} was told to cancel this order {when}', { partner, when: timeAgo(tx.sentAt) }) };
    else if (tx.status === 'FAILED') chip = { cls: 'bg-red-50 text-red-700', text: t('Could not tell {partner} to cancel (attempt {n})', { partner, n: tx.attempts }) };
    else chip = { cls: 'bg-amber-50 text-amber-700', text: t('Waiting to tell {partner} to cancel this order', { partner }) };
  } else if (tx?.status === 'SENT') chip = { cls: 'bg-green-50 text-green-700', text: t('Sent to {partner} {when}', { partner, when: timeAgo(tx.sentAt) }) };
  else if (tx?.status === 'FAILED') chip = { cls: 'bg-red-50 text-red-700', text: t('Could not reach {partner} (attempt {n})', { partner, n: tx.attempts }) };
  else if (automatic) chip = { cls: 'bg-amber-50 text-amber-700', text: t('Waiting to be sent to {partner}', { partner }) };
  else chip = { cls: 'bg-gray-100 text-gray-600', text: t('Not sent automatically — copy the order for {partner}', { partner }) };

  // A cancellation that has not gone through can be pushed by hand, like an order.
  const canSend = automatic && (withdrawing ? tx.status !== 'SENT' : waiting);

  const open = () => { setShowPayload(true); setCopied(false); loadPayload({ variables: { orderId: order.id } }); };
  const payload: string | undefined = payloadData?.orderPartnerPayload;
  const copy = async () => {
    if (!payload) return;
    try { await navigator.clipboard.writeText(payload); setCopied(true); } catch { /* the text is selectable in the box */ }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className={`px-2 py-0.5 rounded-full font-medium ${chip.cls}`}>{chip.text}</span>
      {tx?.status === 'FAILED' && tx.lastError && <span className="text-red-600" title={tx.lastError}>{tx.lastError.length > 60 ? tx.lastError.slice(0, 60) + '…' : tx.lastError}</span>}
      {canSend && (
        <button
          onClick={() => { setError(null); send({ variables: { orderId: order.id } }); }}
          disabled={sending}
          className="text-brand-500 hover:text-brand-900 disabled:opacity-50"
        >
          {sending ? t('Sending…') : tx && (withdrawing || tx.status !== 'PENDING') ? t('Send again') : t('Send now')}
        </button>
      )}
      {status?.configurationProblem && (
        <span className="text-amber-700" title={status.configurationProblem}>{t('Webhook is not fully set up: add PARTNER_WEBHOOK_SECRET')}</span>
      )}
      {waiting && <button onClick={open} className="text-brand-500 hover:text-brand-900">{t('View order for partner')}</button>}
      <InlineError error={error} />

      {showPayload && (
        <Modal title={t('Order for the pharmacy partner')} subtitle={t('Structured summary — exactly what is sent to the partner')} wide onClose={() => setShowPayload(false)}>
          {loadingPayload && !payload ? (
            <p className="text-sm text-gray-500">{t('Loading…')}</p>
          ) : (
            <>
              <pre className="max-h-96 overflow-auto rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-800 whitespace-pre-wrap">{payload}</pre>
              <div className="mt-3 flex items-center gap-3">
                <button onClick={copy} disabled={!payload} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-500 text-white disabled:opacity-40">
                  {copied ? t('Copied!') : t('Copy')}
                </button>
                <p className="text-xs text-gray-400">{t('Contains the patient’s name, date of birth and address — share it only with the partner.')}</p>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
