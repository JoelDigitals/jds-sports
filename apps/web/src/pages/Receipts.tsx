import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { openReceiptPdf } from '../pdf.ts';
import type { Receipt, RulePack } from '../types.ts';
import { Badge, Card, EmptyState, ErrorBox, Field, InfoBox, Modal, Spinner, btnPrimary, btnSecondary, inputClass } from '../components/ui.tsx';
import { PageHeader } from '../components/Layout.tsx';
import { eur, fmtDate } from '../format.ts';

export default function Receipts() {
  const queryClient = useQueryClient();
  const [payoutId, setPayoutId] = useState<number | null>(null);
  const [payoutStatus, setPayoutStatus] = useState<'offen' | 'erhalten' | 'nicht_ausgezahlt'>('offen');
  const [payoutDate, setPayoutDate] = useState('');
  const [payer, setPayer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const receiptsQuery = useQuery({
    queryKey: ['receipts'],
    queryFn: () => api.get<{ receipts: Receipt[] }>('/api/receipts'),
  });
  const rulesQuery = useQuery({
    queryKey: ['rules'],
    queryFn: () => api.get<{ rulePack: RulePack }>('/api/rules/active'),
  });
  const rulePack = rulesQuery.data?.rulePack ?? null;

  const updatePayout = useMutation({
    mutationFn: (payload: { id: number; status: string; payoutDate: string | null; payer: string | null }) =>
      api.post(`/api/receipts/${payload.id}/payout`, {
        status: payload.status,
        payoutDate: payload.payoutDate,
        payer: payload.payer,
      }),
    onSuccess: async () => {
      setPayoutId(null);
      setError(null);
      await queryClient.invalidateQueries();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Fehler beim Speichern'),
  });

  const regenerate = useMutation({
    mutationFn: (id: number) => api.post(`/api/receipts/${id}/regenerate`),
    onSuccess: async (res) => {
      setError(null);
      await queryClient.invalidateQueries();
      await openReceiptPdf((res as { receipt: { id: number } }).receipt.id);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren'),
  });

  const receipts = receiptsQuery.data?.receipts ?? [];

  function openPayoutModal(r: Receipt): void {
    setPayoutId(r.id);
    setPayoutStatus(r.payoutStatus);
    setPayoutDate(r.payoutDate ?? '');
    setPayer(r.payer ?? '');
  }

  function nonPaymentMailto(r: Receipt): string {
    const email = rulePack?.deadlines.nonPaymentEmail ?? 'schiedsrichterabrechnung@hvsaar.de';
    const days = rulePack?.deadlines.nonPaymentDays ?? 14;
    const game = r.games[0];
    const subject = `Nichtauszahlung Spesen – Quittung Nr. ${r.id} – Spiel vom ${game ? fmtDate(game.date) : ''}`;
    const body = [
      'Sehr geehrte Damen und Herren,',
      '',
      `der Heimverein hat die Spielleitungsentschädigung (Gesamtbetrag ${eur(r.total)}) für folgende Einsätze nicht ausgezahlt:`,
      ...r.games.map((g) => `- ${fmtDate(g.date)}: ${g.homeTeam} – ${g.awayTeam} (${g.league})`),
      '',
      'Begründung (bitte ergänzen): ',
      '',
      'Meine Bankverbindung:',
      'IBAN: ',
      'Bank: ',
      '',
      `Die Abrechnungsquittung ist beigefügt (Frist: ${days} Tage nach Nichtauszahlung gemäß DB 7.2.9).`,
      '',
      'Mit freundlichen Grüßen',
    ].join('\n');
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  if (receiptsQuery.isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Quittungen"
        subtitle="Spesenquittungen (DIN-A4-Abrechnungsbogen) verwalten, auszahlen und fristgerecht einreichen"
      />

      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {rulePack && (
        <div className="mb-4">
          <InfoBox>
            <strong>Fristen (DB 7.2.9):</strong> Bei Nichtauszahlung sendest du die Quittung binnen {rulePack.deadlines.nonPaymentDays} Tagen mit
            Begründung und Bankverbindung an <span className="font-mono">{rulePack.deadlines.nonPaymentEmail}</span>. Alle Quittungen eines Jahres
            sind bis <strong>31.01. des Folgejahres</strong> beim Schiedsrichterwart einzureichen – danach kein Auszahlungsanspruch.
          </InfoBox>
        </div>
      )}

      {receipts.length === 0 ? (
        <EmptyState
          title="Noch keine Quittungen"
          hint="Quittungen lassen sich direkt in der Einsatzliste oder über „Quittung vorbereiten“ im Dashboard erstellen – auch schon vor dem Spieltag (Vordruck zum Mitnehmen). Nachgetragene Fahrtkosten einfach per „Aktualisieren“ ins PDF übernehmen."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2">Nr.</th>
                  <th className="px-4 py-2">Spiele</th>
                  <th className="px-4 py-2">Saison</th>
                  <th className="px-4 py-2 text-right">Summe</th>
                  <th className="px-4 py-2">Auszahlung</th>
                  <th className="px-4 py-2">Erstellt</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">{r.id}</td>
                    <td className="px-4 py-3">
                      {r.games.length === 1 ? (
                        <div>
                          <div className="font-medium text-slate-800">{r.games[0].homeTeam} – {r.games[0].awayTeam}</div>
                          <div className="text-xs text-slate-400">{fmtDate(r.games[0].date)} · {r.games[0].league}</div>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-slate-800">Sammelquittung · {r.games.length} Spiele</div>
                          <div className="text-xs text-slate-400">
                            {r.games.map((g) => fmtDate(g.date)).join(', ')} · {r.games[0]?.league}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{r.season}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{eur(r.total)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={r.payoutStatus === 'erhalten' ? 'green' : r.payoutStatus === 'nicht_ausgezahlt' ? 'red' : 'amber'}>
                        {r.payoutStatus === 'erhalten' ? `erhalten${r.payoutDate ? ` (${fmtDate(r.payoutDate)})` : ''}` : r.payoutStatus === 'nicht_ausgezahlt' ? 'nicht ausgezahlt' : 'offen'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{r.createdAt.slice(0, 10).split('-').reverse().join('.')}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2 text-xs">
                        <button className="font-medium text-orange-600 hover:underline" onClick={() => openReceiptPdf(r.id)}>
                          PDF
                        </button>
                        <button
                          className="font-medium text-slate-600 hover:underline disabled:opacity-50"
                          onClick={() => regenerate.mutate(r.id)}
                          disabled={regenerate.isPending}
                          title="Berechnet Spesen neu (z. B. nachgetragene Fahrtkosten) und erzeugt das PDF neu"
                        >
                          {regenerate.isPending && regenerate.variables === r.id ? 'Aktualisiere …' : 'Aktualisieren'}
                        </button>
                        <button className="font-medium text-slate-600 hover:underline" onClick={() => openPayoutModal(r)}>
                          Auszahlung
                        </button>
                        {r.payoutStatus === 'nicht_ausgezahlt' && (
                          <a className="font-medium text-red-600 hover:underline" href={nonPaymentMailto(r)}>
                            E-Mail an HVS
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={payoutId !== null} onClose={() => setPayoutId(null)} title={`Quittung Nr. ${payoutId ?? ''} – Auszahlung`}>
        <div className="space-y-4">
          <Field label="Status der Auszahlung">
            <div className="space-y-2">
              {(
                [
                  ['offen', 'Offen – noch nicht ausgezahlt'],
                  ['erhalten', 'Erhalten – bar am Spieltag ausgezahlt'],
                  ['nicht_ausgezahlt', 'Nicht ausgezahlt – Frist 14 Tage für E-Mail an HVS'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" className="accent-orange-600" checked={payoutStatus === value} onChange={() => setPayoutStatus(value)} />
                  {label}
                </label>
              ))}
            </div>
          </Field>
          {payoutStatus === 'erhalten' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Datum">
                <input type="date" className={inputClass} value={payoutDate} onChange={(e) => setPayoutDate(e.target.value)} />
              </Field>
              <Field label="Ausgezahlt durch (Kassierer)">
                <input className={inputClass} value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="z. B. Kassierer TV Kirkel" />
              </Field>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className={btnSecondary} onClick={() => setPayoutId(null)}>Abbrechen</button>
            <button
              className={btnPrimary}
              onClick={() =>
                updatePayout.mutate({
                  id: payoutId!,
                  status: payoutStatus,
                  payoutDate: payoutStatus === 'erhalten' ? payoutDate || null : null,
                  payer: payoutStatus === 'erhalten' ? payer || null : null,
                })
              }
              disabled={updatePayout.isPending}
            >
              {updatePayout.isPending ? 'Speichere …' : 'Speichern'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
