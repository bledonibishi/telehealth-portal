'use client';

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { formatDistanceToNow, differenceInYears } from 'date-fns';
import { GET_PATIENTS } from '@/graphql/patients';
import PatientPanel from './PatientPanel';

export default function PatientsPage() {
  const { data, loading, error } = useQuery(GET_PATIENTS, { pollInterval: 60_000 });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    <div className="flex h-full">
      {/* List */}
      <div className={`flex flex-col transition-all duration-200 ${selectedId ? 'w-[420px] min-w-[340px]' : 'flex-1'} border-r border-gray-200 overflow-hidden`}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Patients</h1>
            <p className="text-xs text-gray-500 mt-0.5">Users who purchased and activated their account</p>
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
              <p className="text-xs text-gray-400">Pending</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 bg-white border-b border-gray-100 shrink-0">
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {loading && <p className="p-6 text-sm text-gray-400">Loading…</p>}
        {error && <p className="p-6 text-sm text-red-500">{error.message}</p>}

        <div className="overflow-y-auto flex-1">
          {selectedId ? (
            /* Compact list when panel open */
            <div className="divide-y divide-gray-100">
              {patients.map((patient: any) => {
                const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));
                const active = selectedId === patient.id;
                return (
                  <button
                    key={patient.id}
                    onClick={() => setSelectedId(patient.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${active ? 'bg-brand-50 border-l-2 border-brand-500' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                      {patient.firstName[0]}{patient.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${active ? 'text-brand-900' : 'text-gray-900'}`}>
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{age} yrs · {patient.email}</p>
                    </div>
                    {patient.activatedAt ? (
                      <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-green-400" />
                    ) : (
                      <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-amber-400" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Full table when no panel open */
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Patient</th>
                  <th className="px-6 py-3">Age</th>
                  <th className="px-6 py-3">Account status</th>
                  <th className="px-6 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {patients.map((patient: any) => {
                  const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));
                  return (
                    <tr
                      key={patient.id}
                      onClick={() => setSelectedId(patient.id)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                            {patient.firstName[0]}{patient.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{patient.firstName} {patient.lastName}</p>
                            <p className="text-xs text-gray-400">{patient.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{age} yrs</td>
                      <td className="px-6 py-3">
                        {patient.activatedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">✓ Active</span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Awaiting activation</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {formatDistanceToNow(new Date(patient.createdAt), { addSuffix: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && patients.length === 0 && (
            <div className="p-12 text-center text-gray-400 text-sm">No patients yet.</div>
          )}
        </div>
      </div>

      {/* Patient panel */}
      {selectedId && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <PatientPanel
            patientId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}
