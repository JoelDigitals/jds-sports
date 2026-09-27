import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { useFlags } from '../useFlags.ts';
import type { FlagDetail } from '../types.ts';
import { Badge, Card, ErrorBox, Field, InfoBox, Modal, Spinner, btnPrimary, btnSecondary, inputClass } from '../components/ui.tsx';
import { PageHeader } from '../components/Layout.tsx';

export default function FlagsAdmin() {
  const queryClient = useQueryClient();
  const { flags: myFlags, refresh: refreshMyFlags } = useFlags();
  const [editFlag, setEditFlag] = useState<FlagDetail | null>(null);
  const [usersText, setUsersText] = useState('');
  const [clubsText, setClubsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');

  const flagsQuery = useQuery({
    queryKey: ['flags', 'all'],
    queryFn: () => api.get<{ flags: FlagDetail[] }>('/api/flags'),
  });

  const patch = useMutation({
    mutationFn: (payload: { id: number; body: Record<string, unknown> }) => api.patch(`/api/flags/${payload.id}`, payload.body),
    onSuccess: async () => {
      setEditFlag(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['flags'] });
      await refreshMyFlags();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Fehler'),
  });

  const create = useMutation({
    mutationFn: (payload: { name: string; note: string }) => api.post('/api/flags', payload),
    onSuccess: async () => {
      setNewName('');
      setNewNote('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['flags'] });
      await refreshMyFlags();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Fehler'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/flags/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['flags'] });
      await refreshMyFlags();
    },
  });

  function openEdit(f: FlagDetail): void {
    setEditFlag(f);
    setUsersText(f.users.join(', '));
    setClubsText(f.clubs.join(', '));
  }

  function saveEdit(e: FormEvent): void {
    e.preventDefault();
    if (!editFlag) return;
    patch.mutate({
      id: editFlag.id,
      body: {
        note: editFlag.note,
        everyone: editFlag.everyone === 1,
        authenticated: editFlag.authenticated === 1,
        superusers: editFlag.superusers === 1,
        percent: editFlag.percent,
        users: usersText.split(',').map((s) => s.trim()).filter(Boolean),
        clubs: clubsText.split(',').map((s) => s.trim()).filter(Boolean),
      },
    });
  }

  if (flagsQuery.isLoading) return <Spinner />;

  const flags = flagsQuery.data?.flags ?? [];

  return (
    <div>
      <PageHeader
        title="Feature-Flags"
        subtitle="Waffle-artige Steuerung: für alle, Prozent-Rollout, einzelne Nutzer oder ganze Vereine"
      />

      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      <div className="mb-4">
        <InfoBox>
          <strong>Test-Override:</strong> Hänge <span className="font-mono">?dflag=NAME</span> (aktivieren) oder{' '}
          <span className="font-mono">?dflag=-NAME</span> (deaktivieren) an die URL – z. B.{' '}
          <span className="font-mono">#/einstellungen?dflag=import_webcal</span>. Gilt für die aktuelle Ansicht (Server + UI).
        </InfoBox>
      </div>

      <Card className="mb-5 p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Neues Flag anlegen</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name: newName, note: newNote });
          }}
        >
          <Field label="Name (a-z, 0-9, _)">
            <input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. export_steuer" required pattern="[a-z0-9_]+" />
          </Field>
          <div className="min-w-[240px] flex-1">
            <Field label="Beschreibung">
              <input className={inputClass} value={newNote} onChange={(e) => setNewNote(e.target.value)} />
            </Field>
          </div>
          <button className={btnPrimary} disabled={create.isPending || !newName}>Anlegen</button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2">Flag</th>
                <th className="px-4 py-2">Regeln</th>
                <th className="px-4 py-2">Nutzer / Vereine</th>
                <th className="px-4 py-2">Für dich</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flags.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-semibold text-slate-900">{f.name}</div>
                    <div className="max-w-[260px] text-xs text-slate-400">{f.note}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {f.everyone === 1 && <Badge tone="green">alle</Badge>}
                      {f.authenticated === 1 && <Badge tone="blue">angemeldet</Badge>}
                      {f.superusers === 1 && <Badge tone="violet">Admins</Badge>}
                      {f.percent != null && <Badge tone="orange">{f.percent}% Rollout</Badge>}
                      {f.everyone !== 1 && f.authenticated !== 1 && f.superusers !== 1 && f.percent == null && f.users.length === 0 && f.clubs.length === 0 && (
                        <Badge tone="red">inaktiv</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {f.users.length > 0 && <div>Nutzer: {f.users.join(', ')}</div>}
                    {f.clubs.length > 0 && <div>Vereine: {f.clubs.join(', ')}</div>}
                    {f.users.length === 0 && f.clubs.length === 0 && <span className="text-slate-300">–</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={myFlags[f.name] ? 'green' : 'slate'}>{myFlags[f.name] ? 'aktiv' : 'aus'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3 text-xs">
                      <button className="font-medium text-orange-600 hover:underline" onClick={() => openEdit(f)}>Bearbeiten</button>
                      <button
                        className="font-medium text-red-600 hover:underline"
                        onClick={() => {
                          if (window.confirm(`Flag „${f.name}“ löschen?`)) remove.mutate(f.id);
                        }}
                      >
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={editFlag !== null} onClose={() => setEditFlag(null)} title={`Flag „${editFlag?.name ?? ''}“`}>
        {editFlag && (
          <form onSubmit={saveEdit} className="space-y-4">
            <Field label="Beschreibung">
              <input className={inputClass} value={editFlag.note} onChange={(e) => setEditFlag({ ...editFlag, note: e.target.value })} />
            </Field>
            <div className="space-y-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={editFlag.everyone === 1} onChange={(e) => setEditFlag({ ...editFlag, everyone: e.target.checked ? 1 : 0 })} />
                Für alle aktiv (everyone)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={editFlag.authenticated === 1} onChange={(e) => setEditFlag({ ...editFlag, authenticated: e.target.checked ? 1 : 0 })} />
                Für alle angemeldeten Nutzer
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 accent-orange-600" checked={editFlag.superusers === 1} onChange={(e) => setEditFlag({ ...editFlag, superusers: e.target.checked ? 1 : 0 })} />
                Nur für Admins (superusers)
              </label>
            </div>
            <Field label="Percent-Rollout (0–100, leer = aus)" hint="Deterministisch pro Nutzer+Flag verteilt">
              <input
                type="number" min={0} max={100} className={inputClass}
                value={editFlag.percent ?? ''}
                onChange={(e) => setEditFlag({ ...editFlag, percent: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label="Einzelne Nutzer (E-Mails, kommagetrennt)">
              <input className={inputClass} value={usersText} onChange={(e) => setUsersText(e.target.value)} placeholder="demo@jds-sports.de" />
            </Field>
            <Field label="Vereine (kommagetrennt)" hint="Alle Nutzer dieses Vereins (Profilfeld „Verein“)">
              <input className={inputClass} value={clubsText} onChange={(e) => setClubsText(e.target.value)} placeholder="TV Musterstadt, SG Falkenstein" />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setEditFlag(null)}>Abbrechen</button>
              <button type="submit" className={btnPrimary} disabled={patch.isPending}>Speichern</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
