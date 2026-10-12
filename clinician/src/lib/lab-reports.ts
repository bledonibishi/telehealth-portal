import { getToken } from './auth';
import { ApiError } from '@telehealth/shared-types';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql';
const API_ROOT = GRAPHQL_URL.replace(/\/graphql$/, '');

/** Attaches a lab report (PDF or photo) to a patient's record. Returns the report, waiting for its results to be entered. */
export async function uploadLabReport(patientId: string, file: File, note?: string) {
  const body = new FormData();
  body.append('patientId', patientId);
  if (note?.trim()) body.append('note', note.trim());
  body.append('file', file);
  const res = await fetch(`${API_ROOT}/labs/reports`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body });
  if (!res.ok) throw ApiError.fromResponse(res.status, await res.text().catch(() => ''), 'We couldn’t upload that file. Please try again.');
  return (await res.json()) as { id: string; fileUrl: string; filename: string; status: string };
}
