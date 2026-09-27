import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { downloadCsv } from '../pdf.ts';
import type { DashboardData, SummaryData } from '../types.ts';
import { Card, EmptyState, Spinner, StatCard, btnPrimary } from '../components/ui.tsx';
import { PageHeader } from '../components/Layout.tsx';
import { useFlags } from '../useFlags.ts';
import { eur, fmtMonth } from '../format.ts';

function Bar({ value, max, tone = 'orange' }: { value: number; max: number; tone?: 'orange' | 'sky' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${tone === 'orange' ? 'bg-orange-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Reports() {
  const { isActive } = useFlags();
  const csvEnabled = isActive('reports_csv_export');
  const summaryQuery = useQuery({
    queryKey: ['summary'],
    queryFn: () => api.get<SummaryData>('/api/reports/summary'),
  });
  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/api/reports/dashboard'),
  });

  if (summaryQuery.isLoading || dashboardQuery.isLoading) return <Spinner />;
  const summary = summaryQuery.data;
  const dash = dashboardQuery.data;
  if (!summary || !dash) return <EmptyState title="Auswertung nicht verfügbar" />;

  const maxClass = Math.max(1, ...summary.byClass.map((c) => c.total));
  const maxMonth = Math.max(1, ...summary.byMonth.map((m) => m.total));

  return (
    <div>
      <PageHeader
        title="Auswertung"
        subtitle={`Saison ${summary.season} · alle Beträge lt. Regelwerk-Version ${dash.rulePackVersion}`}
        actions={
          csvEnabled ? (
            <button className={btnPrimary} onClick={() => downloadCsv('/api/reports/export.csv', `jds-sports-abrechnung-${summary.season.replace('/', '-')}.csv`)}>
              CSV-Export (Excel)
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Spesen gesamt" value={eur(dash.totals.spesenTotal)} tone="accent" />
        <StatCard label="Einsätze" value={String(dash.totals.games)} />
        <StatCard label="Fahrt-km" value={`${dash.totals.kmTotal.toLocaleString('de-DE')} km`} />
        <StatCard label="Offene Beträge" value={eur(dash.totals.offenTotal)} tone="warn" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Nach Spielklasse</h2>
          {summary.byClass.length === 0 ? (
            <p className="text-sm text-slate-500">Noch keine Einsätze in dieser Saison.</p>
          ) : (
            <ul className="space-y-3">
              {summary.byClass.map((c) => (
                <li key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{c.name} <span className="text-xs text-slate-400">({c.count})</span></span>
                    <span className="font-semibold tabular-nums text-slate-800">{eur(c.total)}</span>
                  </div>
                  <Bar value={c.total} max={maxClass} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Nach Monat</h2>
          {summary.byMonth.length === 0 ? (
            <p className="text-sm text-slate-500">Noch keine Einsätze in dieser Saison.</p>
          ) : (
            <ul className="space-y-3">
              {summary.byMonth.map((m) => (
                <li key={m.month}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{fmtMonth(m.month)} <span className="text-xs text-slate-400">({m.count})</span></span>
                    <span className="font-semibold tabular-nums text-slate-800">{eur(m.total)}</span>
                  </div>
                  <Bar value={m.total} max={maxMonth} tone="sky" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Hinweis zum CSV-Export</h2>
        <p className="text-xs leading-5 text-slate-500">
          Der Export enthält alle Einsätze der Saison mit Entschädigung, Wochentagszuschlag, Doppelansetzung, Fahrtkosten, Gesamtsumme,
          Quittungsnummer und Auszahlungsstatus – geeignet für Steuer, SR-Kostenausgleich (DB 7.3) und die Jahresabgabe beim SR-Wart bis 31.01.
        </p>
      </Card>
    </div>
  );
}
