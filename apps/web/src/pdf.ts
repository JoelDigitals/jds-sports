import { getToken } from './api.ts';

export async function openReceiptPdf(id: number): Promise<void> {
  const res = await fetch(`/api/receipts/${id}/pdf`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('PDF konnte nicht geladen werden');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadCsv(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Export fehlgeschlagen');
  const blob = await res.blob();
  const urlObj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlObj;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(urlObj), 30_000);
}
