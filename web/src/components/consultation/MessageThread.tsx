'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useSubscription } from '@apollo/client';
import { GET_MESSAGES, SEND_MESSAGE, NEW_MESSAGE_SUBSCRIPTION } from '@/graphql/messaging';
import { formatDistanceToNow } from 'date-fns';

export function MessageThread({ consultationId, currentUserId }: { consultationId: string; currentUserId: string }) {
  const [content, setContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, loading } = useQuery(GET_MESSAGES, { variables: { consultationId } });
  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE, {
    onCompleted() { setContent(''); },
  });

  useSubscription(NEW_MESSAGE_SUBSCRIPTION, {
    variables: { consultationId },
    onData({ client, data: { data: subData } }) {
      const cache = client.cache;
      cache.modify({
        fields: {
          messages(existing = []) {
            return [...existing, subData.newMessage];
          },
        },
      });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data]);

  const messages = data?.messages ?? [];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    sendMessage({ variables: { input: { consultationId, content: content.trim() } } });
  };

  return (
    <div className="border border-gray-200 rounded-lg flex flex-col" style={{ height: 400 }}>
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Secure messages</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading && <p className="text-xs text-gray-400">Loading…</p>}
        {messages.map((m: any) => {
          const isMe = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                  isMe ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p>{m.content}</p>
                <p className={`text-xs mt-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
                  {m.senderRole} · {formatDistanceToNow(new Date(m.sentAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="px-4 py-3 border-t border-gray-200 flex gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="submit"
          disabled={sending || !content.trim()}
          className="bg-brand-500 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
