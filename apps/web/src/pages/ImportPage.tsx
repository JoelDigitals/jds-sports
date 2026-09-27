import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import type { CompetitionType, CupRound, ImportAnalyzeResult, ImportDraft, RulePack } from '../types.ts';
import { Badge, Card, ErrorBox, Field, InfoBox, Spinner, btnPrimary, btnSecondary, inputClass } from '../components/ui.tsx';
import { PageHeader } from '../components/Layout.tsx';
import { useFlags } from '../useFlags.ts';
import { COMPETITION_LABELS, ROLE_LABELS, fmtDate, fmtTime } from '../format.ts';

const ACTION_LABELS: Record<string, { label: string; tone: 'green' | 'amber' | 'slate' }> = {
  new: { label: 'Neu', tone: 'green' },
  changed: { label: 'Geändert', tone: 'amber' },
  unchanged: { label: 'Unverändert', tone: 'slate' },
};

export default function ImportPage() {
  const queryClient = useQueryClient();
  const { isActive } = useFlags();
  const webcalEnabled = isActive('import_webcal');
  const fileInput = useRef<HTMLInputElement>(null);
  const [webcalUrl, setWebcalUrl] = useState('');
  const [source, setSource] = useState('nuliga');
  const [analyzedSource, setAnalyzedSource] = useState<string>('nuliga');
  const [result, setResult] = useState<ImportAnalyzeResult | null>(null);
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [appliedInfo, setAppliedInfo] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['rules'],
    queryFn: () => api.get<{ rulePack: RulePack }>('/api/rules/active'),
  });
  const rulePack = rulesQuery.data?.rulePack ?? null;

  const analyzeFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('source', source);
      fd.append('file', file, file.name);
      return api.post<ImportAnalyzeResult>('/api/import/analyze', fd);
    },
    onSuccess: (res) => {
      setError(null);
      setAppliedInfo(null);
      setResult(res);
      setAnalyzedSource(res.source);
      setDrafts(res.items.map((i) => ({ ...i.draft })));
      setSelected(new Set(res.items.map((_, idx) => idx).filter((idx) => res.items[idx].action !== 'unchanged')));
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Import fehlgeschlagen'),
  });

  const analyzeUrl = useMutation({
    mutationFn: (url: string) =>
      api.post<ImportAnalyzeResult>('/api/import/analyze', { webcalUrl: url, source }),
    onSuccess: (res) => {
      setError(null);
      setAppliedInfo(null);
      setResult(res);
      setAnalyzedSource(res.source);
      setDrafts(res.items.map((i) => ({ ...i.draft })));
      setSelected(new Set(res.items.map((_, idx) => idx).filter((idx) => res.items[idx].action !== 'unchanged')));
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Kalender-URL konnte nicht abgerufen werden'),
  });

  const apply = useMutation({
    mutationFn: () => {
      const items = drafts.filter((_, idx) => selected.has(idx));
      return api.post<{ created: number; updated: number }>('/api/import/apply', { source: analyzedSource, items });
    },
    onSuccess: async (res) => {
      setAppliedInfo(`Übernommen: ${res.created} neue Ansetzung(en), ${res.updated} aktualisiert. Spesen wurden automatisch berechnet.`);
      setResult(null);
      setDrafts([]);
      setSelected(new Set());
      await queryClient.invalidateQueries();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Übernahme fehlgeschlagen'),
  });

  function setDraft(idx: number, patch: Partial<ImportDraft>): void {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function toggle(idx: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Import (ICS & CSV)"
        subtitle="Schiedsrichter-Ansetzungen aus nuLiga, handball.net oder Handball360 importieren – Spesenabrechnung wird automatisch vorbereitet"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Datei hochladen (ICS oder CSV)</h2>
          <p className="mb-3 text-xs text-slate-500">
            <strong>nuLiga:</strong> Persönlicher Bereich → „Schiedsrichter-Einsätze“ → iCal-Export ·{' '}
            <strong>handball.net:</strong> Kalenderabo (ICS) ·{' '}
            <strong>Handball360:</strong> SR-Plattform → Tabelle als CSV exportieren (Format wird automatisch erkannt)
          </p>
          <div className="mb-3">
            <Field label="Quelle (bei ICS-Dateien)" hint="CSV-Dateien der Handball360-Plattform werden automatisch erkannt und zugeordnet">
              <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="nuliga">nuLiga (HVSaar)</option>
                <option value="handballnet">handball.net Kalenderabo</option>
                <option value="handball360">Handball360 (CSV-Export)</option>
                <option value="file">Datei / Outlook / Google</option>
              </select>
            </Field>
          </div>
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-8 text-center transition hover:border-orange-400 hover:bg-orange-50/40"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) analyzeFile.mutate(file);
            }}
          >
            <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div className="text-sm font-medium text-slate-700">Datei auswählen oder hierher ziehen</div>
            <div className="text-xs text-slate-400">.ics (iCal) oder .csv (Handball360) · max. 5 MB</div>
            <input
              ref={fileInput}
              type="file"
              accept=".ics,.csv,text/calendar,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) analyzeFile.mutate(file);
              }}
            />
          </div>
          {analyzeFile.isPending && <div className="mt-3"><Spinner label="Analysiere Kalender …" /></div>}
        </Card>

        {webcalEnabled ? (
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Kalender-Abonnement (Webcal)</h2>
            <p className="mb-3 text-xs text-slate-500">
              Kalender-URL (webcal:// oder https://) einmalig eintragen – die App lädt die Ansetzungen direkt vom Server.
            </p>
            <Field label="Kalender-URL">
              <input
                className={inputClass}
                placeholder="webcal://… oder https://…"
                value={webcalUrl}
                onChange={(e) => setWebcalUrl(e.target.value)}
              />
            </Field>
            <button
              className={`${btnSecondary} mt-3`}
              onClick={() => analyzeUrl.mutate(webcalUrl)}
              disabled={!webcalUrl.trim() || analyzeUrl.isPending}
            >
              {analyzeUrl.isPending ? 'Lädt …' : 'Kalender abrufen'}
            </button>
          </Card>
        ) : (
          <Card className="p-5 opacity-60">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Kalender-Abonnement (Webcal)</h2>
            <p className="text-xs text-slate-500">
              Dieses Feature ist per Feature-Flag deaktiviert (Rollout-Steuerung). Aktivierung durch den Administrator
              (Menü „Feature-Flags").
            </p>
          </Card>
        )}
        <div className="mt-4 lg:col-span-2">
          <InfoBox>
            <strong>Hinweis Handball360:</strong> Eine offizielle API ist beim DHB aktuell nur auf Antrag verfügbar (PRD Kap. 7.2). Bis zur
            Freigabe dient der ICS-Import als Brücke – sobald eine API existiert, wird sie als zusätzliche Quelle eingebunden.
          </InfoBox>
        </div>
      </div>

      {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      {appliedInfo && <div className="mt-4"><InfoBox>{appliedInfo}</InfoBox></div>}

      {result && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{result.total} Termine gefunden</span>
              <Badge tone="slate">
                {result.source === 'handball360' ? 'Handball360 CSV' : result.source === 'handballnet' ? 'handball.net' : result.source === 'nuliga' ? 'nuLiga' : 'Datei'}
              </Badge>
              <Badge tone="green">{result.new} neu</Badge>
              <Badge tone="amber">{result.changed} geändert</Badge>
              <Badge tone="slate">{result.unchanged} unverändert</Badge>
              {result.skipped != null && result.skipped > 0 && <Badge tone="red">{result.skipped} übersprungen</Badge>}
            </div>
            <button className={btnPrimary} onClick={() => apply.mutate()} disabled={apply.isPending || selected.size === 0}>
              {apply.isPending ? 'Übernehme …' : `${selected.size} Termine übernehmen`}
            </button>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="w-8 px-3 py-2"></th>
                    <th className="px-3 py-2">Aktion</th>
                    <th className="px-3 py-2">Termin</th>
                    <th className="px-3 py-2">Begegnung</th>
                    <th className="px-3 py-2">Klasse</th>
                    <th className="px-3 py-2">Typ</th>
                    <th className="px-3 py-2">Runde</th>
                    <th className="px-3 py-2">Rolle</th>
                    <th className="px-3 py-2">Halle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.items.map((item, idx) => {
                    const draft = drafts[idx];
                    const action = ACTION_LABELS[item.action];
                    return (
                      <tr key={draft.sourceUid} className={selected.has(idx) ? 'bg-orange-50/40' : ''}>
                        <td className="px-3 py-2">
                          <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={selected.has(idx)} onChange={() => toggle(idx)} />
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={action.tone}>{action.label}</Badge>
                          {item.changes.length > 0 && (
                            <div className="mt-1 text-xs text-amber-700">{item.changes.join(', ')}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-600">
                          {fmtDate(draft.gameDatetime)}
                          <div className="text-xs text-slate-400">{fmtTime(draft.gameDatetime)} Uhr</div>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {draft.homeTeam}
                          <div className="text-xs font-normal text-slate-400">gg. {draft.awayTeam || '–'}</div>
                        </td>
                        <td className="px-3 py-2">
                          <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={draft.leagueKey ?? ''} onChange={(e) => setDraft(idx, { leagueKey: e.target.value || null })}>
                            <option value="">– wählen –</option>
                            {rulePack?.classes.map((c) => (
                              <option key={c.key} value={c.key}>{c.name}</option>
                            ))}
                            {draft.competitionType === 'friendly' &&
                              rulePack?.friendlies.explicit.map((f) => (
                                <option key={f.key} value={f.key}>{f.name}</option>
                              ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            value={draft.competitionType}
                            onChange={(e) => setDraft(idx, { competitionType: e.target.value as CompetitionType })}
                          >
                            {Object.entries(COMPETITION_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {draft.competitionType === 'cup' ? (
                            <select
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                              value={draft.cupRound ?? ''}
                              onChange={(e) => setDraft(idx, { cupRound: (e.target.value || null) as CupRound | null })}
                            >
                              <option value="">– wählen –</option>
                              {rulePack?.cupRounds.map((r) => (
                                <option key={r.key} value={r.key}>{r.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-slate-400">–</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select className="rounded-md border border-slate-300 px-2 py-1 text-xs" value={draft.role} onChange={(e) => setDraft(idx, { role: e.target.value as ImportDraft['role'] })}>
                            {Object.entries(ROLE_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{draft.hall || '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="mt-2 text-xs text-slate-400">
            Klassen und Runden vor dem Übernehmen prüfen – unklare Zuordnungen führen zu 0 € und Warnungen im Einsatzdetail.
          </p>
        </div>
      )}
    </div>
  );
}
