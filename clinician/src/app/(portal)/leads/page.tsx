'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { formatDistanceToNow } from 'date-fns';
import { GET_LEADS } from '@/graphql/leads';

const KIND_BADGE: Record<string, string> = {
  HRT:  'bg-violet-100 text-violet-700',
  GLP1: 'bg-teal-100 text-teal-700',
};

export default function LeadsPage() {
  const { data, loading, error } = useQuery(GET_LEADS, { pollInterval: 60_000 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const leads = (data?.leads ?? []).filter((l: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.email.toLowerCase().includes(q) ||
      l.firstName.toLowerCase().includes(q) ||
      l.lastName.toLowerCase().includes(q)
    );
  });

  const converted = leads.filter((l: any) => l.convertedAt).length;
  const pending = leads.filter((l: any) => !l.convertedAt).length;

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Leads</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Users who completed the eligibility quiz
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="font-semibold text-gray-900">{leads.length}</p>
            <p className="text-xs text-gray-400">Total</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-amber-600">{pending}</p>
            <p className="text-xs text-gray-400">Not converted</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-green-600">{converted}</p>
            <p className="text-xs text-gray-400">Converted</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 bg-white border-b border-gray-100">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {loading && <p className="p-6 text-sm text-gray-400">Loading…</p>}
      {error && <p className="p-6 text-sm text-red-500">{error.message}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-6 py-3">Name</th>
            <th className="px-6 py-3">Email</th>
            <th className="px-6 py-3">Product</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Submitted</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {leads.map((lead: any) => (
            <>
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">
                  {lead.firstName} {lead.lastName}
                </td>
                <td className="px-6 py-3 text-gray-500">{lead.email}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${KIND_BADGE[lead.productKind] ?? 'bg-gray-100 text-gray-600'}`}>
                    {lead.productKind}
                  </span>
                </td>
                <td className="px-6 py-3">
                  {lead.convertedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                      ✓ Patient
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                      Not paid
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
                </td>
                <td className="px-6 py-3 text-right">
                  <button
                    onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
                    className="text-xs text-brand-500 hover:text-brand-900"
                  >
                    {expanded === lead.id ? 'Hide quiz' : 'View quiz'}
                  </button>
                </td>
              </tr>

              {/* Expandable quiz summary */}
              {expanded === lead.id && (
                <tr key={`${lead.id}-quiz`}>
                  <td colSpan={6} className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Quiz summary — {lead.productKind}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {(lead.quizAnswers ?? []).map((a: any, i: number) => (
                        <div key={i} className="bg-white rounded-lg border border-gray-100 px-4 py-2.5">
                          <p className="text-xs text-gray-400">{a.question}</p>
                          <p className="text-sm text-gray-800 font-medium mt-0.5">{a.answer}</p>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {!loading && leads.length === 0 && (
        <div className="p-12 text-center text-gray-400 text-sm">No leads yet.</div>
      )}
    </div>
  );
}
