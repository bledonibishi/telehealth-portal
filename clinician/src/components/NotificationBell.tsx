'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { GET_NOTIFICATION_COUNTS } from '@/graphql/notifications';
import { getCurrentRole, type ClinicianRole } from '@/lib/role';

type Item = { label: string; count: number; href: string; roles: ClinicianRole[] };

const ITEMS: Item[] = [
  { label: 'New leads today',           count: 0, href: '/leads',    roles: ['ADMIN', 'CX_TEAM'] },
  { label: 'Consultations awaiting review', count: 0, href: '/queue', roles: ['ADMIN', 'DOCTOR'] },
  { label: 'Patient messages with no reply', count: 0, href: '/patients', roles: ['ADMIN', 'DOCTOR', 'CX_TEAM'] },
  { label: 'Orders pending dispatch',   count: 0, href: '/orders',   roles: ['ADMIN', 'PROVIDER'] },
];

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const role = getCurrentRole();

  const { data } = useQuery(GET_NOTIFICATION_COUNTS, { pollInterval: 30_000 });
  const counts = data?.notificationCounts;

  const items: Item[] = [
    { ...ITEMS[0], count: counts?.newLeads ?? 0 },
    { ...ITEMS[1], count: counts?.pendingConsultations ?? 0 },
    { ...ITEMS[2], count: counts?.patientMessages ?? 0 },
    { ...ITEMS[3], count: counts?.pendingOrders ?? 0 },
  ].filter((item) => !role || item.roles.includes(role));

  const total = items.reduce((sum, i) => sum + i.count, 0);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
          </div>

          {items.length === 0 || total === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">All caught up 🎉</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {items.filter((i) => i.count > 0).map((item) => (
                <button
                  key={item.href}
                  onClick={() => { router.push(item.href); setOpen(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                >
                  <p className="text-sm text-gray-700">{item.label}</p>
                  <span className="ml-3 shrink-0 w-6 h-6 bg-red-100 text-red-600 text-xs font-bold rounded-full flex items-center justify-center">
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">Refreshes every 30 seconds</p>
          </div>
        </div>
      )}
    </div>
  );
}
