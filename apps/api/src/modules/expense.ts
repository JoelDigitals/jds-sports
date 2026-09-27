import type { RulePack, ClassRate } from './rules.ts';

export type AssignmentStatus =
  | 'angesetzt'
  | 'bestätigt'
  | 'verlegt'
  | 'abgesagt'
  | 'ausgefallen_angereist'
  | 'ausgefallen_nicht_angereist'
  | 'geleitet';

export type AssignmentRole = 'sr1' | 'sr2' | 'esr' | 'zns';
export type CompetitionType = 'championship' | 'cup' | 'friendly' | 'tournament';

export const STATUS_LABELS: Record<AssignmentStatus, string> = {
  angesetzt: 'Angesetzt',
  bestätigt: 'Bestätigt',
  verlegt: 'Verlegt',
  abgesagt: 'Abgesagt',
  ausgefallen_angereist: 'Ausgefallen (angereist)',
  ausgefallen_nicht_angereist: 'Ausgefallen (nicht angereist)',
  geleitet: 'Geleitet',
};

export const ROLE_LABELS: Record<AssignmentRole, string> = {
  sr1: 'Schiedsrichter 1',
  sr2: 'Schiedsrichter 2',
  esr: 'Einzelschiedsrichter',
  zns: 'Zeitnehmer/Sekretär',
};

export const COMPETITION_LABELS: Record<CompetitionType, string> = {
  championship: 'Meisterschaft',
  cup: 'Pokal',
  friendly: 'Freundschaftsspiel',
  tournament: 'Turnier',
};

export interface SameDayContext {
  travelCount: number;
  hallIndex: number;
  dayKm: number | null;
}

export interface CalcInput {
  status: AssignmentStatus;
  role: AssignmentRole;
  league: string;
  leagueKey: string | null;
  competitionType: CompetitionType;
  cupRound?: string | null;
  tournamentGroup?: string | null;
  tournamentTier?: string | null;
  gamesCount: number;
  dateLocal: string;
  hall: string;
  travelKm: number | null;
  travelKmManual: boolean;
  travelMitfahrer: boolean;
  pnvCost: number | null;
  otherCost: number | null;
  sameDay: SameDayContext;
}

export interface BreakdownItem {
  key: string;
  label: string;
  amount: number;
  detail?: string;
  warning?: string;
}

export interface CalcResult {
  total: number;
  items: BreakdownItem[];
  warnings: string[];
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function isHolidaySaarland(dateLocal: string): boolean {
  const [ys, ms, ds] = dateLocal.split('-').map(Number);
  const year = ys;
  const mm = ms;
  const dd = ds;
  const easter = easterSunday(year);
  const rel = (days: number) => {
    const d = new Date(easter.getTime() + days * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  const fixed = [
    `${year}-01-01`,
    `${year}-05-01`,
    `${year}-10-03`,
    `${year}-11-01`,
    `${year}-12-25`,
    `${year}-12-26`,
  ];
  const movable = [rel(-2), rel(1), rel(39), rel(50), rel(60)];
  const key = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return fixed.includes(key) || movable.includes(key);
}

function classRate(pack: RulePack, classKey: string | null, role: AssignmentRole): { rate: number | null; cls: ClassRate | null; warning?: string } {
  const cls = pack.classes.find((c) => c.key === classKey) ?? null;
  if (!cls) return { rate: null, cls: null, warning: `Spielklasse "${classKey ?? '–'}" nicht im Regelwerk gefunden` };
  if (role === 'esr') return { rate: cls.rates.sr_einzel, cls };
  if (role === 'zns') {
    if (cls.rates.zns == null) {
      return { rate: 0, cls, warning: `Kein ZNS-Satz für "${cls.name}" hinterlegt (ZNS-Sätze lt. DB 7.3.7 nur Pokalfinale Ostermontag)` };
    }
    return { rate: cls.rates.zns, cls };
  }
  return { rate: cls.rates.sr_gespann, cls };
}

export function isYouthLeague(leagueText: string): boolean {
  return /jugend|jpj|\b[a-e]-jugend\b|weibl\.?\s+jugend|männl\.?\s+jugend/i.test(leagueText);
}

export function calcExpense(input: CalcInput, pack: RulePack): CalcResult {
  const items: BreakdownItem[] = [];
  const warnings: string[] = [];

  if (input.status === 'abgesagt' || input.status === 'ausgefallen_nicht_angereist') {
    items.push({
      key: 'no_fee',
      label: input.status === 'abgesagt' ? 'Keine Spesen (Spiel abgesagt)' : 'Keine Spesen (nicht angereist)',
      amount: 0,
    });
    return { total: 0, items, warnings };
  }

  const cancelled = input.status === 'ausgefallen_angereist';
  const cancelFactor = cancelled ? pack.cancellation.factor : 1;

  let base = 0;
  let baseDetail = '';

  if (input.competitionType === 'championship') {
    const { rate, cls, warning } = classRate(pack, input.leagueKey, input.role);
    if (warning) warnings.push(warning);
    base = (rate ?? 0) * cancelFactor;
    baseDetail = cls ? cls.name : input.league;
  } else if (input.competitionType === 'cup') {
    const round = pack.cupRounds.find((r) => r.key === input.cupRound);
    if (!round) {
      warnings.push('Pokalrunde nicht angegeben oder unbekannt – Satz 0 €, bitte Runde wählen');
    } else {
      let rate = round.rate;
      baseDetail = round.name;
      if (pack.cupCapClass) {
        const cap = classRate(pack, pack.cupCapClass, input.role).rate;
        if (cap != null && rate > cap) {
          rate = cap;
          baseDetail += ` (Obergrenze ${pack.cupCapClass}-Satz)`;
        }
      }
      base = rate * cancelFactor;
    }
  } else if (input.competitionType === 'friendly') {
    const explicit = pack.friendlies.explicit.find((e) => e.key === input.leagueKey);
    if (explicit) {
      base = explicit.rate * cancelFactor;
      baseDetail = explicit.name;
    } else {
      const cls = pack.classes.find((c) => c.key === input.leagueKey);
      const friendlyRate = pack.friendlies.classRates[input.leagueKey ?? ''];
      if (friendlyRate != null && cls) {
        base = friendlyRate * cancelFactor;
        baseDetail = `Freundschaftsspiel: ${cls.name} (fester Satz lt. DB 7.2.3)`;
      } else {
        warnings.push('Klasse des Heimvereins unbekannt – Freundschafssspiel-Satz nicht ermittelbar');
      }
    }
  } else if (input.competitionType === 'tournament') {
    const group = pack.tournamentGroups.find((g) => g.key === (input.tournamentGroup ?? 'turnier'));
    const tier = group?.tiers.find((t) => t.key === input.tournamentTier);
    if (!group || !tier) {
      warnings.push('Turnier-Art oder Spielzeit-Staffel nicht gewählt – Satz 0 €');
    } else {
      const youth = isYouthLeague(input.league);
      const rate = youth ? tier.jugend : tier.aktive;
      if (rate == null) {
        warnings.push(`Staffel „${tier.name}“ gilt nur für Jugend-Turniere`);
      } else {
        const count = Math.max(1, input.gamesCount);
        base = rate * count * cancelFactor;
        baseDetail = `${group.name.split(' (')[0]}: ${tier.name} × ${count} Spiel(e)${youth ? ', Jugend-Satz' : ''}`;
      }
    }
  }

  const roleSuffix = input.role === 'esr' ? ' (Einzelschiedsrichter)' : input.role === 'zns' ? ' (Z/S)' : '';
  items.push({
    key: 'base',
    label: `Spielleitungsentschädigung${cancelled ? ' – 50 % (Spiel ausgefallen, angereist)' : ''}`,
    amount: round2(base),
    detail: `${baseDetail}${roleSuffix}`,
  });

  if (base > 0) {
    const d = new Date(`${input.dateLocal.slice(0, 10)}T12:00:00`);
    const dow = d.getDay();
    if (pack.weekdayBonus.days.includes(dow)) {
      const holiday = isHolidaySaarland(input.dateLocal.slice(0, 10));
      if (holiday) {
        if (pack.weekdayBonus.skipHolidays) {
          items.push({
            key: 'weekday',
            label: 'Wochenspielpauschale entfällt (gesetzlicher Feiertag)',
            amount: 0,
          });
        } else {
          items.push({ key: 'weekday', label: 'Wochenspielpauschale (Mo–Fr)', amount: pack.weekdayBonus.amount });
        }
      } else {
        items.push({ key: 'weekday', label: 'Wochenspielpauschale (Mo–Fr)', amount: pack.weekdayBonus.amount });
      }
    }

    if (input.sameDay.hallIndex >= 1) {
      items.push({
        key: 'double',
        label: 'Zusatzspesen Doppelansetzung',
        amount: pack.doubleBonus.amount,
        detail: `${input.sameDay.hallIndex + 1}. Spiel in derselben Halle an diesem Tag`,
      });
    }
  }

  if (input.travelKm != null && input.travelKm > 0) {
    let effectiveKm = input.travelKm;
    let shareNote = '';
    if (!input.travelKmManual && input.sameDay.travelCount > 1 && input.sameDay.dayKm != null) {
      effectiveKm = round2(input.sameDay.dayKm / input.sameDay.travelCount);
      shareNote = ` – anteilig 1/${input.sameDay.travelCount} der Tageskilometer (${input.sameDay.dayKm} km)`;
    }
    const kmRate = input.travelMitfahrer ? pack.travel.kmRateMitfahrer : pack.travel.kmRate;
    const money = round2(effectiveKm * kmRate);
    items.push({
      key: 'travel',
      label: `Fahrtkosten PKW${input.travelMitfahrer ? ' (Gespann/Mitfahrer)' : ' (Einzelfahrt)'}`,
      amount: money,
      detail: `${effectiveKm} km × ${kmRate.toFixed(2)} €/km${shareNote}`,
    });
  } else if (input.status === 'geleitet' || input.status === 'ausgefallen_angereist') {
    warnings.push('Fahrtkosten noch nicht erfasst');
  }

  if (input.pnvCost != null && input.pnvCost > 0) {
    items.push({
      key: 'pnv',
      label: 'Fahrtkosten – PNV (Öffentliche)',
      amount: round2(input.pnvCost),
      detail: 'Einzelfahrtkosten öffentliche Verkehrsmittel lt. Abrechnungsbogen',
    });
  }

  if (input.otherCost != null && input.otherCost > 0) {
    items.push({
      key: 'other',
      label: 'Sonstige Auslagen',
      amount: round2(input.otherCost),
    });
  }

  const total = round2(items.reduce((sum, it) => sum + it.amount, 0));
  return { total, items, warnings };
}
