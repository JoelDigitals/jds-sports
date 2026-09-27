import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';
import type { RulePack, User } from '../types.ts';
import { Badge, Card, ErrorBox, Field, InfoBox, Spinner, WarnBox, btnPrimary, inputClass } from '../components/ui.tsx';
import { PageHeader } from '../components/Layout.tsx';
import { ROLE_LABELS, eur } from '../format.ts';

export default function Settings() {
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    club: '',
    street: '',
    zip: '',
    city: '',
    phone: '',
    iban: '',
    partnerName: '',
    partnerAddress: '',
    defaultRole: 'sr1',
  });
  const [savedInfo, setSavedInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.first_name ?? '',
        lastName: user.last_name ?? '',
        club: user.club ?? '',
        street: user.street ?? '',
        zip: user.zip ?? '',
        city: user.city ?? '',
        phone: user.phone ?? '',
        iban: user.iban ?? '',
        partnerName: user.partner_name ?? '',
        partnerAddress: user.partner_address ?? '',
        defaultRole: user.default_role ?? 'sr1',
      });
    }
  }, [user]);

  const rulesQuery = useQuery({
    queryKey: ['rules'],
    queryFn: () => api.get<{ rulePack: RulePack }>('/api/rules/active'),
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: (payload: Record<string, string>) => api.patch<{ user: User }>('/api/users/me', payload),
    onSuccess: async () => {
      setError(null);
      setSavedInfo('Stammdaten gespeichert. Spesen wurden mit deiner Standard-Rolle neu berechnet.');
      await refresh();
      await queryClient.invalidateQueries();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Fehler beim Speichern'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(form);
  }

  if (!user) return <Spinner />;

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const pack = rulesQuery.data?.rulePack;

  return (
    <div>
      <PageHeader title="Einstellungen" subtitle="Stammdaten für die Spesenquittung und dein Regelwerk" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Stammdaten (HVS-Abrechnungsbogen)</h2>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vorname">
                <input className={inputClass} value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} required />
              </Field>
              <Field label="Nachname">
                <input className={inputClass} value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} required />
              </Field>
            </div>
            <Field label="Verein">
              <input className={inputClass} value={form.club} onChange={(e) => set({ club: e.target.value })} />
            </Field>
            <div className="grid grid-cols-[1fr_80px_1fr] gap-3">
              <Field label="Straße">
                <input className={inputClass} value={form.street} onChange={(e) => set({ street: e.target.value })} />
              </Field>
              <Field label="PLZ">
                <input className={inputClass} value={form.zip} onChange={(e) => set({ zip: e.target.value })} />
              </Field>
              <Field label="Ort">
                <input className={inputClass} value={form.city} onChange={(e) => set({ city: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefon">
                <input className={inputClass} value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </Field>
              <Field label="IBAN" hint="wird für die Nichtauszahlungs-Mail verwendet">
                <input className={inputClass} value={form.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase() })} />
              </Field>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Gespann-Partner (SR B im Abrechnungsbogen)</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <input className={inputClass} value={form.partnerName} onChange={(e) => set({ partnerName: e.target.value })} placeholder="Vor- und Nachname" />
                </Field>
                <Field label="Wohnort, Straße">
                  <input className={inputClass} value={form.partnerAddress} onChange={(e) => set({ partnerAddress: e.target.value })} placeholder="Straße, PLZ Ort" />
                </Field>
              </div>
              <p className="mt-2 text-xs text-slate-400">Wird im offiziellen Vordruck in der Spalte „SR B" vorgefasst – Beträge trägt der Partner selbst ein.</p>
            </div>
            <Field label="Standard-Rolle bei Importen">
              <select className={inputClass} value={form.defaultRole} onChange={(e) => set({ defaultRole: e.target.value })}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            {error && <ErrorBox message={error} />}
            {savedInfo && <InfoBox>{savedInfo}</InfoBox>}
            <button type="submit" className={btnPrimary} disabled={save.isPending}>
              {save.isPending ? 'Speichere …' : 'Stammdaten speichern'}
            </button>
          </form>
        </Card>

        <div className="space-y-6">
          {pack && (
            <>
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Regelwerk {pack.associationName}</h2>
                  <Badge tone="orange">Saison {pack.season} · v{pack.version}</Badge>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-1.5">Spielklasse</th>
                      <th className="py-1.5 text-right">SR (Gespann)</th>
                      <th className="py-1.5 text-right">Einzelschiedsrichter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pack.classes.map((c) => (
                      <tr key={c.key}>
                        <td className="py-1.5 text-slate-700">
                          {c.name}
                          {!c.verified && <Badge tone="amber">unverifiziert</Badge>}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{eur(c.rates.sr_gespann)}</td>
                        <td className="py-1.5 text-right tabular-nums">{eur(c.rates.sr_einzel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-500">
                  <div>Pokal (DB 7.2.6): {pack.cupRounds.map((r) => `${r.name.split(' (')[0]} ${eur(r.rate)}`).join(' · ')}</div>
                  <div>Wochentagszuschlag Mo–Fr: {eur(pack.weekdayBonus.amount)} (Feiertage ausgenommen)</div>
                  <div>Doppelansetzung: +{eur(pack.doubleBonus.amount)}</div>
                  <div>Fahrtkosten: {pack.travel.kmRate.toFixed(2)} €/km · Gespann {pack.travel.kmRateMitfahrer.toFixed(2)} €/km (DB 7.2.10)</div>
                  <div>Ausfall (angereist): 50 % + Fahrtkosten</div>
                  <div>Freundschaftsspiele: feste Sätze je Heimvereins-Klasse (DB 7.2.3)</div>
                  <div className="col-span-2">Nichtauszahlung: {pack.deadlines.nonPaymentDays} Tage → {pack.deadlines.nonPaymentEmail} · Abgabe bis 31.01. (DB 7.2.11)</div>
                </div>
              </Card>

              <WarnBox>
                <strong>Verifizierungsstatus:</strong> Sätze mit „unverifiziert“ basieren auf den Durchführungsbestimmungen 2023/24 bzw. 2025/26
                und sind laut PRD (offene Fragen F1/F2/F10) mit dem Original des HVSaar abzugleichen. Die Doppelspalte der Aktiven-Klassen wird als
                „pro SR im Gespann / als Einzelschiedsrichter“ interpretiert. Das Regelwerk liegt versioniert als JSON vor
                (apps/api/data/rulepacks) und kann ohne Code-Änderung angepasst werden.
              </WarnBox>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
