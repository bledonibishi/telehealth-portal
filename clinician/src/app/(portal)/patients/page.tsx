'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import Link from 'next/link';
import { formatDistanceToNow, differenceInYears } from 'date-fns';
import { GET_PATIENTS } from '@/graphql/patients';

export default function PatientsPage() {
  const { data, loading, error } = useQuery(GET_PATIENTS, { pollInterval: 60_000 });
  const [search, setSearch] = useState('');

  const patients = (data?.patients ?? []).filter((p: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.email.toLowerCase().includes(q) ||
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q)
    );
  });

  const activated = patients.filter((p: any) => p.activatedAt).length;

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Patients</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Users who purchased and activated their account
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="font-semibold text-gray-900">{patients.length}</p>
            <p className="text-xs text-gray-400">Total</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-green-600">{activated}</p>
            <p className="text-xs text-gray-400">Activated</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-amber-600">{patients.length - activated}</p>
            <p className="text-xs text-gray-400">Pending activation</p>
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
            <th className="px-6 py-3">Patient</th>
            <th className="px-6 py-3">Age</th>
            <th className="px-6 py-3">Account status</th>
            <th className="px-6 py-3">Joined</th>
            <th className="px-6 py-3">Consultations</th>
            <th className="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {patients.map((patient: any) => {
            const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));
            return (
              <tr key={patient.id} className="hover:bg-gray-50">
                <td className="px-6 py-3">
                  <p className="font-medium text-gray-900">
                    {patient.firstName} {patient.lastName}
                  </p>
                  <p className="text-xs text-gray-400">{patient.email}</p>
                </td>
                <td className="px-6 py-3 text-gray-600">{age} yrs</td>
                <td className="px-6 py-3">
                  {patient.activatedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                      ✓ Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                      Awaiting activation
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {formatDistanceToNow(new Date(patient.createdAt), { addSuffix: true })}
                </td>
                <td className="px-6 py-3 text-gray-500">—</td>
                <td className="px-6 py-3 text-right">
                  <Link
                    href={`/queue?patient=${patient.id}`}
                    className="text-xs text-brand-500 hover:text-brand-900"
                  >
                    View consultations →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!loading && patients.length === 0 && (
        <div className="p-12 text-center text-gray-400 text-sm">No patients yet.</div>
      )}
    </div>
  );
}
