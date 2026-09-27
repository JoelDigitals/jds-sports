export const eur = (n: number | null | undefined): string =>
  n == null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const eurPlain = (n: number | null | undefined): string =>
  n == null ? '–' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

export const fmtDateLong = (iso: string): string => {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtTime = (iso: string): string => iso.slice(11, 16);

export const fmtMonth = (month: string): string => {
  const date = new Date(`${month}-01T12:00:00`);
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
};

export const STATUS_LABELS: Record<string, string> = {
  angesetzt: 'Angesetzt',
  bestätigt: 'Bestätigt',
  verlegt: 'Verlegt',
  abgesagt: 'Abgesagt',
  ausgefallen_angereist: 'Ausgefallen (angereist)',
  ausgefallen_nicht_angereist: 'Ausgefallen (nicht angereist)',
  geleitet: 'Geleitet',
};

export const ROLE_LABELS: Record<string, string> = {
  sr1: 'Schiedsrichter 1',
  sr2: 'Schiedsrichter 2',
  esr: 'Einzelschiedsrichter',
  zns: 'Zeitnehmer/Sekretär',
};

export const COMPETITION_LABELS: Record<string, string> = {
  championship: 'Meisterschaft',
  cup: 'Pokal',
  friendly: 'Freundschaftsspiel',
  tournament: 'Turnier',
};

export const CUP_ROUND_LABELS: Record<string, string> = {
  quali: 'Qualifikation',
  r1: '1. Runde',
  r2_3: '2./3. Runde',
  halbfinalturnier: 'Halbfinalturnier',
  final4: 'Final4',
};

export const TOURNAMENT_TIER_LABELS: Record<string, string> = {
  bis_2x20: 'bis 2×20 min',
  ab_2x25: 'ab 2×25 min',
};

export const PAYOUT_LABELS: Record<string, string> = {
  offen: 'offen',
  erhalten: 'erhalten',
  nicht_ausgezahlt: 'nicht ausgezahlt',
};
