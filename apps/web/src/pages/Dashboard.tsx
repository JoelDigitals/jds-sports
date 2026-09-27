import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { openReceiptPdf } from '../pdf.ts';
import type { DashboardData } from '../types.ts';
import { Card, EmptyState, Spinner, StatCard, StatusBadge, Badge } from '../components/ui.tsx';
import { PageHeader } from '../components/Layout.tsx';
import { eur, fmtDateLong, fmtTime, STATUS_LABELS } from '../format.ts';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/reports/dashboard'),
  });

  const prepareReceipt = useMutation({
    mutationFn: (assignmentId: number) =>
      api.post<{ receipt: { id: number } }>('/api/receipts', { assignmentIds: [assignmentId] }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries();
      await openReceiptPdf(res.receipt.id);
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !data) return <EmptyState title="Dashboard konnte nicht geladen werden" hint={error instanceof Error ? error.message : undefined} />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Saison ${data.season} · Regelwerk ${data.rulePackVersion} · Handball-Verband Saar`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Spesen (Saison)" value={eur(data.totals.spesenTotal)} tone="accent" sub={`${data.totals.games} Einsätze`} />
        <StatCard label="Geleitet" value={String(data.totals.geleitet)} tone="success" />
        <StatCard label="Noch offen" value={eur(data.totals.offenTotal)} tone="warn" sub={`${data.totals.openCount} Quittung(en)`} />
        <StatCard label="Fahrt-km" value={`${data.totals.kmTotal.toLocaleString('de-DE')} km`} />
        <StatCard label="Nächster Einsatz" value={data.next[0] ? fmtDateLong(data.next[0].gameDatetime).replace(/,.*$/, '') : '–'} sub={data.next[0] ? `${fmtTime(data.next[0].gameDatetime)} Uhr` : 'keine anstehenden'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Kommende Spiele {data.next.length > 0 && <span className="ml-1 text-xs font-normal text-slate-400">({data.next.length})</span>}
            </h2>
            <Link to="/einsaetze" className="text-xs font-medium text-orange-600 hover:underline">
              alle Einsätze →
            </Link>
          </div>
          {data.next.length === 0 ? (
            <EmptyState title="Keine anstehenden Einsätze" hint="Importiere deine Ansetzungen aus nuLiga/handball.net (ICS) oder Handball360 (CSV) – Menü „Import“." />
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-400">
                Quittung vorbereiten = Vordruck (Reisekostenabrechnung) gefüllt mit Spieldaten zum Mitnehmen zum Spieltag – Fahrtkosten einfach nachtragen und PDF neu generieren.
              </p>
              <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto pr-1">
                {data.next.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {n.homeTeam} – {n.awayTeam}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {fmtDateLong(n.gameDatetime)} · {fmtTime(n.gameDatetime)} Uhr · {n.league}
                        {n.hall ? ` · ${n.hall}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={n.status} labels={STATUS_LABELS} />
                        <span className="text-sm font-semibold tabular-nums text-slate-700">{eur(n.expenseTotal)}</span>
                      </div>
                      <button
                        className="text-xs font-medium text-orange-600 hover:underline disabled:opacity-50"
                        onClick={() => prepareReceipt.mutate(n.id)}
                        disabled={prepareReceipt.isPending}
                      >
                        {prepareReceipt.isPending ? 'Erstelle …' : 'Quittung vorbereiten (PDF)'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Fristen-Wächter</h2>
            {data.deadlines.length === 0 && data.nonPaymentOverdue.length === 0 ? (
              <p className="text-sm text-slate-500">Aktuell keine offenen Fristen. Alle Quittungen sind ausgeglichen.</p>
            ) : (
              <div className="space-y-3">
                {data.deadlines.map((d) => (
                  <div key={d.year} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-xs text-amber-900">
                      <span className="font-semibold">{d.count} offene Quittung(en)</span> aus {d.year}
                      <div className="text-amber-700">Einreichung bis {d.deadline} beim SR-Wart (DB 7.2.9)</div>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-amber-900">{eur(d.amount)}</span>
                  </div>
                ))}
                {data.nonPaymentOverdue.map((n) => (
                  <div key={n.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <span className="font-semibold">Nichtauszahlung Quittung Nr. {n.id}:</span> Frist von {n.limit} Tagen überschritten ({n.days} Tage).
                    <div className="mt-0.5 text-red-700">E-Mail an {data.nonPaymentEmail} vorbereiten → Quittungen-Seite.</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Letzte Quittungen</h2>
              <Link to="/quittungen" className="text-xs font-medium text-orange-600 hover:underline">
                alle anzeigen →
              </Link>
            </div>
            {data.recentReceipts.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Quittungen erstellt.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentReceipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-600">
                      Nr. {r.id} · {r.gameDate ? r.gameDate.split('-').reverse().join('.') : '–'}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={r.payoutStatus === 'erhalten' ? 'green' : r.payoutStatus === 'nicht_ausgezahlt' ? 'red' : 'amber'}>
                        {r.payoutStatus === 'erhalten' ? 'erhalten' : r.payoutStatus === 'nicht_ausgezahlt' ? 'nicht ausgezahlt' : 'offen'}
                      </Badge>
                      <span className="font-semibold tabular-nums text-slate-800">{eur(r.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
