import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import type { Assignment, AssignmentDetail, CompetitionType, CupRound, RulePack } from '../types.ts';
import { Card, EmptyState, ErrorBox, Field, InfoBox, Modal, Spinner, StatusBadge, btnDanger, btnPrimary, btnSecondary, inputClass } from '../components/ui.tsx';
import { PageHeader } from '../components/Layout.tsx';
import { COMPETITION_LABELS, ROLE_LABELS, STATUS_LABELS, eur, fmtDate, fmtDateLong, fmtTime } from '../format.ts';

interface FormState {
  gameDatetime: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueKey: string;
  competitionType: CompetitionType;
  cupRound: string;
  tournamentGroup: string;
  tournamentTier: string;
  gamesCount: number;
  hall: string;
  hallAddress: string;
  role: string;
  status: string;
  travelKm: string;
  travelKmManual: boolean;
  travelMitfahrer: boolean;
  pnvCost: string;
  otherCost: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    gameDatetime: '',
    homeTeam: '',
    awayTeam: '',
    league: '',
    leagueKey: '',
    competitionType: 'championship',
    cupRound: 'r1',
    tournamentGroup: 'turnier',
    tournamentTier: '2x25',
    gamesCount: 1,
    hall: '',
    hallAddress: '',
    role: 'sr1',
    status: 'angesetzt',
    travelKm: '',
    travelKmManual: false,
    travelMitfahrer: false,
    pnvCost: '',
    otherCost: '',
    notes: '',
  };
}

function formFromAssignment(a: Assignment): FormState {
  return {
    gameDatetime: a.gameDatetime,
    homeTeam: a.homeTeam,
    awayTeam: a.awayTeam,
    league: a.league,
    leagueKey: a.leagueKey ?? '',
    competitionType: a.competitionType,
    cupRound: a.cupRound ?? 'r1',
    tournamentGroup: a.tournamentGroup ?? 'turnier',
    tournamentTier: a.tournamentTier ?? '2x25',
    gamesCount: a.gamesCount,
    hall: a.hall,
    hallAddress: a.hallAddress,
    role: a.role,
    status: a.status,
    travelKm: a.travelKm != null ? String(a.travelKm) : '',
    travelKmManual: a.travelKmManual,
    travelMitfahrer: a.travelMitfahrer,
    pnvCost: a.pnvCost != null ? String(a.pnvCost) : '',
    otherCost: a.otherCost != null ? String(a.otherCost) : '',
    notes: a.notes,
  };
}

export default function Assignments() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [detailId, setDetailId] = useState<number | 'new' | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', statusFilter, monthFilter],
    queryFn: () =>
      api.get<{ assignments: Assignment[] }>(
        `/api/assignments?${new URLSearchParams(
          ([statusFilter ? ['status', statusFilter] : null, monthFilter ? ['month', monthFilter] : null].filter(Boolean) as [string, string][])
        ).toString()}`
      ),
  });
  const rulesQuery = useQuery({
    queryKey: ['rules'],
    queryFn: () => api.get<{ rulePack: RulePack }>('/api/rules/active'),
  });

  const createReceipt = useMutation({
    mutationFn: (ids: number[]) => api.post<{ receipt: { id: number } }>('/api/receipts', { assignmentIds: ids }),
    onSuccess: async (res) => {
      setSelected(new Set());
      setActionInfo(`Quittung Nr. ${res.receipt.id} erstellt. PDF ist unter „Quittungen“ verfügbar.`);
      await queryClient.invalidateQueries();
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Quittung'),
  });

  const assignments = assignmentsQuery.data?.assignments ?? [];

  const byDay = useMemo(() => {
    const groups = new Map<string, Assignment[]>();
    for (const a of [...assignments].sort((x, y) => y.gameDatetime.localeCompare(x.gameDatetime))) {
      const key = a.gameDatetime.slice(0, 10);
      const list = groups.get(key) ?? [];
      list.push(a);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [assignments]);

  const eligibleSelected = useMemo(
    () => assignments.filter((a) => selected.has(a.id) && !['abgesagt', 'ausgefallen_nicht_angereist'].includes(a.status)),
    [assignments, selected]
  );

  function toggle(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <PageHeader
        title="Einsätze"
        subtitle="Alle Ansetzungen mit automatischer Spesenberechnung"
        actions={
          <button className={btnPrimary} onClick={() => { setActionError(null); setActionInfo(null); setDetailId('new'); }}>
            + Einsatz manuell anlegen
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">alle</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Monat">
          <input type="month" className={inputClass} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        </Field>
        {(statusFilter || monthFilter) && (
          <button
            className={btnSecondary}
            onClick={() => { setStatusFilter(''); setMonthFilter(''); }}
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {actionError && <div className="mb-4"><ErrorBox message={actionError} /></div>}
      {actionInfo && <div className="mb-4"><InfoBox>{actionInfo}</InfoBox></div>}

      {eligibleSelected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <span className="text-sm text-orange-900">
            {eligibleSelected.length} Spiel(e) ausgewählt – Quittung/Sammelquittung erstellen (gleicher Tag, anteilige Fahrtkosten). Der Vordruck kann auch schon vor dem Spieltag vorbereitet werden.
          </span>
          <button className={btnPrimary} onClick={() => createReceipt.mutate(eligibleSelected.map((a) => a.id))} disabled={createReceipt.isPending}>
            {createReceipt.isPending ? 'Erstelle …' : `Quittung erstellen (${eligibleSelected.length})`}
          </button>
        </div>
      )}

      {assignmentsQuery.isLoading ? (
        <Spinner />
      ) : byDay.length === 0 ? (
        <EmptyState
          title="Keine Einsätze gefunden"
          hint="Importiere deine Schiedsrichter-Ansetzungen als ICS-Datei aus nuLiga oder handball.net (Menü „Kalender-Import“) oder lege Einsätze manuell an."
        />
      ) : (
        <div className="space-y-5">
          {byDay.map(([day, games]) => (
            <Card key={day} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                <span className="text-sm font-semibold text-slate-700">{fmtDateLong(day)}</span>
                <span className="text-xs text-slate-500">
                  {games.length} Spiel(e) · Tagessumme {eur(games.reduce((s, g) => s + (g.expenseTotal ?? 0), 0))}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="w-8 px-3 py-2"></th>
                      <th className="px-3 py-2">Zeit</th>
                      <th className="px-3 py-2">Begegnung</th>
                      <th className="px-3 py-2">Wettbewerb</th>
                      <th className="px-3 py-2">Rolle</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Spesen</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {games.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5">
                          {!['abgesagt', 'ausgefallen_nicht_angereist'].includes(a.status) && (
                            <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-600">{fmtTime(a.gameDatetime)}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {a.homeTeam} – {a.awayTeam}
                          {a.hall && <div className="text-xs font-normal text-slate-400">{a.hall}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {COMPETITION_LABELS[a.competitionType]}
                          <div className="text-xs text-slate-400">{a.league}</div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{ROLE_LABELS[a.role] ?? a.role}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={a.status} labels={STATUS_LABELS} /></td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800">{eur(a.expenseTotal)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <button className="text-xs font-medium text-orange-600 hover:underline" onClick={() => { setActionError(null); setActionInfo(null); setDetailId(a.id); }}>
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {detailId !== null && (
        <AssignmentModal
          id={detailId}
          rulePack={rulesQuery.data?.rulePack ?? null}
          onClose={() => setDetailId(null)}
          onSaved={async () => {
            await queryClient.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}

function AssignmentModal({
  id,
  rulePack,
  onClose,
  onSaved,
}: {
  id: number | 'new';
  rulePack: RulePack | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isNew = id === 'new';
  const detailQuery = useQuery({
    queryKey: ['assignment', id],
    queryFn: () => api.get<AssignmentDetail>(`/api/assignments/${id}`),
    enabled: !isNew,
  });

  const [form, setForm] = useState<FormState | null>(isNew ? emptyForm() : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedInfo, setSavedInfo] = useState<string | null>(null);

  const current = detailQuery.data;
  if (!isNew && current && form === null) {
    setForm(formFromAssignment(current.assignment));
  }

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        gameDatetime: f.gameDatetime,
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        league: f.league,
        leagueKey: f.leagueKey || null,
        competitionType: f.competitionType,
        cupRound: f.competitionType === 'cup' ? f.cupRound : null,
        tournamentGroup: f.competitionType === 'tournament' ? f.tournamentGroup : null,
        tournamentTier: f.competitionType === 'tournament' ? f.tournamentTier : null,
        gamesCount: f.competitionType === 'tournament' ? Number(f.gamesCount) || 1 : 1,
        hall: f.hall,
        hallAddress: f.hallAddress,
        role: f.role,
        status: f.status,
        travelKm: f.travelKm === '' ? null : Number(f.travelKm),
        travelKmManual: f.travelKmManual,
        travelMitfahrer: f.travelMitfahrer,
        pnvCost: f.pnvCost === '' ? null : Number(f.pnvCost),
        otherCost: f.otherCost === '' ? null : Number(f.otherCost),
        notes: f.notes,
      };
      if (isNew) return api.post('/api/assignments', payload);
      return api.patch(`/api/assignments/${id}`, payload);
    },
    onSuccess: async () => {
      setSaveError(null);
      setSavedInfo('Gespeichert. Spesen wurden neu berechnet.');
      await onSaved();
    },
    onError: (err) => setSaveError(err instanceof Error ? err.message : 'Fehler beim Speichern'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/assignments/${id}`),
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
  });

  const createReceipt = useMutation({
    mutationFn: () => api.post<{ receipt: { id: number } }>('/api/receipts', { assignmentIds: [id as number] }),
    onSuccess: async (res) => {
      setSavedInfo(`Quittung Nr. ${res.receipt.id} erstellt – siehe Menü „Quittungen“.`);
      await onSaved();
    },
    onError: (err) => setSaveError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Quittung'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form) save.mutate(form);
  }

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const [kmInfo, setKmInfo] = useState<string | null>(null);
  const calcKm = useMutation({
    mutationFn: async (f: FormState) => {
      if (isNew) {
        return api.post<{ km: number; minutes: number; from: string; to: string }>('/api/travel-km/preview', { to: f.hallAddress || f.hall });
      }
      const res = await api.post<{ result: { km: number; minutes: number; from: string; to: string } }>(`/api/assignments/${id}/travel-km`);
      return res.result;
    },
    onSuccess: async (r) => {
      set({ travelKm: String(r.km) });
      setKmInfo(`${r.km} km (Hin + Rück, ca. ${r.minutes} min je Richtung) · ${r.from} → ${r.to}`);
      if (!isNew) await onSaved();
    },
    onError: (err) => setKmInfo(err instanceof Error ? err.message : 'km konnten nicht berechnet werden'),
  });

  if (!isNew && detailQuery.isLoading) {
    return (
      <Modal open={true} onClose={onClose} title="Einsatz" wide>
        <Spinner />
      </Modal>
    );
  }

  if (!form) {
    return (
      <Modal open={true} onClose={onClose} title="Einsatz" wide>
        <EmptyState title="Einsatz nicht gefunden" />
      </Modal>
    );
  }

  const expense = current?.expense ?? null;

  return (
    <Modal open={true} onClose={onClose} title={isNew ? 'Neuen Einsatz anlegen' : `Einsatz vom ${fmtDate(form.gameDatetime)}`} wide>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum & Uhrzeit">
              <input type="datetime-local" className={inputClass} value={form.gameDatetime} onChange={(e) => set({ gameDatetime: e.target.value })} required />
            </Field>
            <Field label="Rolle">
              <select className={inputClass} value={form.role} onChange={(e) => set({ role: e.target.value })}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Heim">
              <input className={inputClass} value={form.homeTeam} onChange={(e) => set({ homeTeam: e.target.value })} required />
            </Field>
            <Field label="Gast">
              <input className={inputClass} value={form.awayTeam} onChange={(e) => set({ awayTeam: e.target.value })} />
            </Field>
          </div>
          <Field label="Wettbewerb">
            <select className={inputClass} value={form.competitionType} onChange={(e) => set({ competitionType: e.target.value as CompetitionType })}>
              {Object.entries(COMPETITION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Spielklasse (Regelwerk)" hint="Bestimmt den Spesensatz (DB 7.2.1). Für Freundschaftsspiele: Klasse des Heimvereins wählen (50 %-Regel).">
            <select className={inputClass} value={form.leagueKey} onChange={(e) => set({ leagueKey: e.target.value })}>
              <option value="">– nicht zugeordnet –</option>
              {rulePack?.classes.map((c) => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
              {form.competitionType === 'friendly' &&
                rulePack?.friendlies.explicit.map((f) => (
                  <option key={f.key} value={f.key}>{f.name} (fester Satz {eur(f.rate)})</option>
                ))}
            </select>
          </Field>
          {form.competitionType === 'cup' && (
            <Field label="Pokalrunde (DB 7.2.5)">
              <select className={inputClass} value={form.cupRound} onChange={(e) => set({ cupRound: e.target.value as CupRound })}>
                {rulePack?.cupRounds.map((r) => (
                  <option key={r.key} value={r.key}>{r.name} ({eur(r.rate)})</option>
                ))}
              </select>
            </Field>
          )}
          {form.competitionType === 'tournament' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Turnier-Art (DB 7.2.3/7.2.4/7.2.7)">
                <select className={inputClass} value={form.tournamentGroup} onChange={(e) => set({ tournamentGroup: e.target.value, tournamentTier: '' })}>
                  {rulePack?.tournamentGroups.map((g) => (
                    <option key={g.key} value={g.key}>{g.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Staffel (Spielzeit)">
                <select className={inputClass} value={form.tournamentTier} onChange={(e) => set({ tournamentTier: e.target.value })}>
                  <option value="">– wählen –</option>
                  {(rulePack?.tournamentGroups.find((g) => g.key === form.tournamentGroup)?.tiers ?? []).map((t) => (
                    <option key={t.key} value={t.key}>{t.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Anzahl Spiele">
                <input type="number" min={1} max={30} className={inputClass} value={form.gamesCount} onChange={(e) => set({ gamesCount: Number(e.target.value) })} />
              </Field>
            </div>
          )}
          <Field label="Liga (Anzeige)">
            <input className={inputClass} value={form.league} onChange={(e) => set({ league: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Halle">
              <input className={inputClass} value={form.hall} onChange={(e) => set({ hall: e.target.value })} />
            </Field>
            <Field label="Hallenadresse" hint="Straße, PLZ Ort – für die km-Berechnung">
              <input className={inputClass} value={form.hallAddress} onChange={(e) => set({ hallAddress: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={(e) => set({ status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fahrt-km (Hin + Rück)" hint="Wird automatisch aus deiner Adresse und der Hallenadresse berechnet. Bei mehreren Spielen am Tag erfolgt die Aufteilung automatisch.">
              <div className="flex gap-2">
                <input type="number" min={0} step="0.1" className={inputClass} value={form.travelKm} onChange={(e) => set({ travelKm: e.target.value })} />
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={calcKm.isPending || !(form.hallAddress || form.hall)}
                  onClick={() => calcKm.mutate(form)}
                  title="km aus eigener Adresse und Hallenadresse berechnen"
                >
                  {calcKm.isPending ? '…' : 'km berechnen'}
                </button>
              </div>
              {kmInfo && <span className="mt-1 block text-xs text-slate-500">{kmInfo}</span>}
            </Field>
            <div className="flex flex-col justify-end gap-1 pb-1 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={form.travelKmManual} onChange={(e) => set({ travelKmManual: e.target.checked })} />
                km-Wert manuell (nicht aufteilen)
              </label>
              <label className="flex items-center gap-2" title="DB 7.2.10: +0,02 € je Mitfahrer = 0,32 €/km (Gespannfahrt lt. Bogen)">
                <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={form.travelMitfahrer} onChange={(e) => set({ travelMitfahrer: e.target.checked })} />
                Mitfahrt im Gespann (0,32 €/km)
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PNV-Einzelfahrtkosten (€)" hint="Öffentliche Verkehrsmittel lt. Abrechnungsbogen">
              <input type="number" min={0} step="0.01" className={inputClass} value={form.pnvCost} onChange={(e) => set({ pnvCost: e.target.value })} />
            </Field>
            <Field label="Sonstige Auslagen (€)">
              <input type="number" min={0} step="0.01" className={inputClass} value={form.otherCost} onChange={(e) => set({ otherCost: e.target.value })} />
            </Field>
          </div>
          <Field label="Notizen">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Spesenberechnung</h3>
            {expense ? (
              <>
                <ul className="space-y-1.5 text-sm">
                  {expense.breakdown.map((item, idx) => (
                    <li key={idx} className="flex items-start justify-between gap-3">
                      <span className="text-slate-600">
                        {item.label}
                        {item.detail && <span className="block text-xs text-slate-400">{item.detail}</span>}
                      </span>
                      <span className="font-medium tabular-nums text-slate-800">{eur(item.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2">
                  <span className="text-sm font-semibold text-slate-900">Gesamt</span>
                  <span className="text-lg font-bold tabular-nums text-orange-600">{eur(expense.total)}</span>
                </div>
                {expense.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {expense.warnings.map((w, i) => (
                      <div key={i} className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">⚠ {w}</div>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-slate-400">Regelwerk {expense.rulepack_version} · berechnet {expense.calculated_at}</div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Nach dem Speichern erscheint hier die vollständige Herleitung der Spesen.</p>
            )}
          </Card>

          {saveError && <ErrorBox message={saveError} />}
          {savedInfo && <InfoBox>{savedInfo}</InfoBox>}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btnPrimary} disabled={save.isPending}>
              {save.isPending ? 'Speichere …' : isNew ? 'Einsatz anlegen' : 'Änderungen speichern'}
            </button>
            {!isNew && !['abgesagt', 'ausgefallen_nicht_angereist'].includes(form.status) && (
              <button type="button" className={btnSecondary} onClick={() => createReceipt.mutate()} disabled={createReceipt.isPending}>
                {createReceipt.isPending ? 'Erstelle …' : 'Quittung (PDF) erstellen'}
              </button>
            )}
            {!isNew && (
              <button
                type="button"
                className={btnDanger}
                onClick={() => {
                  if (window.confirm('Einsatz wirklich löschen?')) deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
              >
                Löschen
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
