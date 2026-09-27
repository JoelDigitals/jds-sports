import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import type { RulePack } from '../modules/rules.ts';
import type { BreakdownItem } from '../modules/expense.ts';
import { isYouthLeague } from '../modules/expense.ts';

export interface ReceiptGame {
  id: number;
  sourceUid: string | null;
  gameDatetime: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  leagueKey: string | null;
  competitionType: string;
  cupRound: string | null;
  tournamentGroup: string | null;
  tournamentTier: string | null;
  gamesCount: number;
  hall: string;
  hallAddress: string;
  role: string;
  status: string;
  notes: string;
  travelMitfahrer: boolean;
  travelKm: number | null;
  travelMinutes: number | null;
  /** Fahrt des Gespannpartners (SR B) von seiner Adresse, falls berechenbar */
  partnerTravel: { km: number; minutes: number } | null;
  calc: { total: number; items: BreakdownItem[]; warnings: string[]; travelKmEffective: number | null };
}

export interface ReceiptUserData {
  firstName: string;
  lastName: string;
  club: string;
  street: string;
  zip: string;
  city: string;
  iban: string;
  partnerName: string;
  partnerAddress: string;
}

// Offizieller HVS-Bogen „Reisekostenabrechnung für Schiedsrichter“ (Stand 01.07.2024), leer.
const FORM_PATH = join(import.meta.dirname, '..', '..', 'data', 'vorlagen', 'HVS_Abrechnungsbogen_2024_07_01.pdf');

const FONT_SIZE = 10.5;

// Positionen in PDF-Punkten (Ursprung unten links), ermittelt aus einem von Hand ausgefüllten Original-Bogen.
// y = Grundlinie der Schrift. Bereiche {x, w} entsprechen den Unterstrichen auf dem Bogen.
const POS = {
  gameNo: { x: 61, w: 149, y: 724 },
  home: { x: 231, w: 149, y: 724 },
  away: { x: 401, w: 143, y: 724 },
  date: { x: 61, w: 149, y: 677 },
  hall: { x: 231, w: 149, y: 677 },
  place: { x: 401, w: 143, y: 677 },

  classY: 627.4,
  classX: { OL: 63.8, VL: 126, BzLiga: 188, 'A-Liga': 252, 'B-Liga': 315.8, Männer: 377, Frauen: 438.2, Jugend: 503 } as Record<string, number>,
  sonstigeBox: { x: 63.8, y: 601.8 },
  sonstigeText: { x: 113, w: 250, y: 598 },

  srA: {
    name: { x: 61, w: 222, y: 535.5 },
    address: { x: 61, w: 222, y: 506.4 },
    depart: { x: 64, w: 219, y: 453.5 },
    back: { x: 62, w: 221, y: 411.9 },
    fee: { x: 205, w: 58, y: 371.6 },
    pnv: { x: 240, w: 36, y: 339 },
    singleKm: { x: 121, w: 25, y: 314.6 },
    singleMoney: { x: 238, w: 38, y: 314.6 },
    teamKm: { x: 126, w: 18, y: 284 },
    teamMoney: { x: 240, w: 36, y: 284 },
    other: { x: 240, w: 36, y: 254 },
    sum: { x: 216, w: 56, y: 216.5 },
  },
  srB: {
    name: { x: 325, w: 222, y: 535.5 },
    address: { x: 327, w: 220, y: 495.9 },
    depart: { x: 331, w: 216, y: 453.5 },
    back: { x: 334, w: 213, y: 411.9 },
    fee: { x: 470, w: 50, y: 373 },
    pnv: { x: 498, w: 38, y: 339 },
    singleKm: { x: 384, w: 23, y: 314.6 },
    singleMoney: { x: 498, w: 36, y: 314.6 },
    teamKm: { x: 384, w: 19, y: 284 },
    teamMoney: { x: 500, w: 36, y: 284 },
    other: { x: 493, w: 43, y: 254 },
    sum: { x: 476, w: 56, y: 219 },
  },
  total: { x: 470, w: 58, y: 139 },
  placeDate: { x: 66, w: 126, y: 138 },
};

type Box = { x: number; y: number; w: number };
type SrPos = typeof POS.srA;

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtKm(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/** Anpfiff ± Minuten, auf 5 Minuten gerundet, Format „28.02.2026 12:00 Uhr“ */
function timeAt(iso: string, deltaMinutes: number): string {
  const d = new Date(`${iso.slice(0, 10)}T${iso.slice(11, 16)}:00`);
  const step = 5 * 60000;
  const t = d.getTime() + deltaMinutes * 60000;
  d.setTime(deltaMinutes < 0 ? Math.floor(t / step) * step : Math.ceil(t / step) * step);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())} Uhr`;
}

// Vorlauf vor Anpfiff (Anreise lt. DB spätestens 45 min vorher) bzw. Spieldauer inkl. Nachbereitung
const ARRIVE_BEFORE_MIN = 60;
const GAME_AND_AFTER_MIN = 120;

function departTime(g: ReceiptGame, driveMin: number | null): string {
  return timeAt(g.gameDatetime, -(ARRIVE_BEFORE_MIN + (driveMin ?? 30)));
}

function returnTime(g: ReceiptGame, driveMin: number | null): string {
  return timeAt(g.gameDatetime, GAME_AND_AFTER_MIN + (driveMin ?? 30));
}

function cityFromAddress(addr: string): string {
  const m = addr.match(/\b\d{5}\s+([^,]+)/);
  return m ? m[1].trim() : '';
}

/** nuLiga: „Spielnummer 1001“ in der Beschreibung bzw. UID „…-1001“ */
function gameNumber(g: ReceiptGame): string {
  const fromNotes = g.notes.match(/spiel(?:nummer|-?nr\.?)\s*:?\s*(\d+)/i);
  if (fromNotes) return fromNotes[1];
  const fromUid = g.sourceUid?.match(/(\d{3,})$/);
  if (fromUid) return fromUid[1];
  return g.sourceUid && g.sourceUid.length <= 20 ? g.sourceUid : '';
}

function itemAmount(items: BreakdownItem[], key: string): number {
  return items.find((i) => i.key === key)?.amount ?? 0;
}

function classBoxes(g: ReceiptGame): { checked: string[]; sonstige: string } {
  const youth = isYouthLeague(g.league);
  const frauen = /frauen|damen|weibl/i.test(g.league);
  const key = g.leagueKey ?? '';
  const checked: string[] = [];

  if (g.competitionType === 'championship') {
    if (key === 'oberliga' || key.startsWith('oberliga_jugend')) checked.push('OL');
    else if (key === 'verbandsliga') checked.push('VL');
    else if (key === 'bezirksliga' || key.startsWith('bezirksliga_jugend')) checked.push('BzLiga');
    else if (key === 'a_liga') checked.push('A-Liga');
    else if (key === 'b_liga') checked.push('B-Liga');
    checked.push(youth ? 'Jugend' : frauen ? 'Frauen' : 'Männer');
    return { checked, sonstige: key === 'jpj' ? 'Jugend pfeift Jugend' : '' };
  }

  const cupNames: Record<string, string> = {
    quali: 'Pokal-Qualifikation',
    r1: 'Pokal 1. Runde',
    r2_3: 'Pokal 2./3. Runde',
    halbfinalturnier: 'Pokal Halbfinalturnier',
    final4: 'Pokal Final4',
  };
  const kind =
    g.competitionType === 'cup'
      ? cupNames[g.cupRound ?? ''] ?? 'Pokalspiel'
      : g.competitionType === 'friendly'
        ? 'Freundschaftsspiel'
        : g.tournamentGroup === 'vorbereitungsturnier'
          ? 'Vorbereitungsturnier'
          : g.tournamentGroup === 'pokalturnier_jugend'
            ? 'Pokalturnier Jugend'
            : 'Turnier';
  return { checked, sonstige: `${kind} – ${g.league}` };
}

class Writer {
  constructor(private page: PDFPage, private font: PDFFont) {}

  text(text: string, box: Box, align: 'left' | 'center' | 'right' = 'left'): void {
    if (!text) return;
    let size = FONT_SIZE;
    while (size > 6 && this.font.widthOfTextAtSize(text, size) > box.w) size -= 0.25;
    const w = this.font.widthOfTextAtSize(text, size);
    const x = align === 'left' ? box.x : align === 'center' ? box.x + (box.w - w) / 2 : box.x + box.w - w;
    this.page.drawText(text, { x, y: box.y, size, font: this.font, color: rgb(0, 0, 0) });
  }

  cross(cx: number, cy: number, r = 3.4): void {
    const o = { thickness: 1.1, color: rgb(0, 0, 0) };
    this.page.drawLine({ start: { x: cx - r, y: cy - r }, end: { x: cx + r, y: cy + r }, ...o });
    this.page.drawLine({ start: { x: cx - r, y: cy + r }, end: { x: cx + r, y: cy - r }, ...o });
  }
}

interface SrColumn {
  name: string;
  address: string;
  driveMin: number | null;
  fee: number;
  pnv: number;
  km: number | null;
  travel: number;
  team: boolean;
  other: number;
}

function sumOf(c: SrColumn): number {
  return Math.round((c.fee + c.pnv + c.travel + c.other) * 100) / 100;
}

function writeColumn(w: Writer, p: SrPos, c: SrColumn, g: ReceiptGame): void {
  w.text(c.name, p.name);
  w.text(c.address, p.address);
  w.text(departTime(g, c.driveMin), p.depart);
  w.text(returnTime(g, c.driveMin), p.back);
  w.text(fmtEur(c.fee), p.fee, 'right');
  if (c.pnv > 0) w.text(fmtEur(c.pnv), p.pnv, 'right');
  if (c.km != null && c.travel > 0) {
    w.text(fmtKm(c.km), c.team ? p.teamKm : p.singleKm, 'center');
    w.text(fmtEur(c.travel), c.team ? p.teamMoney : p.singleMoney, 'right');
  }
  if (c.other > 0) w.text(fmtEur(c.other), p.other, 'right');
  w.text(fmtEur(sumOf(c)), p.sum, 'right');
}

/** Datenebene für ein Spiel – gleiche Seitengröße wie der Bogen, nur Text/Kreuze. */
function drawOverlay(page: PDFPage, font: PDFFont, g: ReceiptGame, user: ReceiptUserData, pack: RulePack): void {
  const w = new Writer(page, font);

  w.text(gameNumber(g), POS.gameNo, 'center');
  w.text(g.homeTeam, POS.home, 'center');
  w.text(g.awayTeam, POS.away, 'center');
  w.text(fmtDate(g.gameDatetime), POS.date, 'center');
  w.text(g.hall, POS.hall, 'center');
  w.text(cityFromAddress(g.hallAddress), POS.place, 'center');

  const cb = classBoxes(g);
  for (const label of cb.checked) w.cross(POS.classX[label], POS.classY);
  if (cb.sonstige) {
    w.cross(POS.sonstigeBox.x, POS.sonstigeBox.y);
    w.text(cb.sonstige, POS.sonstigeText);
  }

  const items = g.calc.items;
  const fee = itemAmount(items, 'base') + itemAmount(items, 'weekday') + itemAmount(items, 'double');
  const srA: SrColumn = {
    name: [user.lastName, user.firstName].filter(Boolean).join(', '),
    address: [user.street, `${user.zip} ${user.city}`.trim()].filter(Boolean).join(', '),
    driveMin: g.travelMinutes,
    fee,
    pnv: itemAmount(items, 'pnv'),
    km: g.calc.travelKmEffective,
    travel: itemAmount(items, 'travel'),
    team: g.travelMitfahrer,
    other: itemAmount(items, 'other'),
  };
  writeColumn(w, POS.srA, srA, g);

  let total = sumOf(srA);
  const gespann = (g.role === 'sr1' || g.role === 'sr2') && user.partnerName.trim() !== '';
  if (gespann) {
    // Gemeinsame Anreise (Gespannfahrt): Partner fährt mit, eigene Fahrtkosten entfallen.
    // Sonst eigene Anreise von der Partneradresse; bei mehreren Spielen am Tag anteilig wie SR A.
    const share = g.travelKm && g.calc.travelKmEffective != null ? g.calc.travelKmEffective / g.travelKm : 1;
    const pKm = !g.travelMitfahrer && g.partnerTravel ? Math.round(g.partnerTravel.km * share * 10) / 10 : null;
    const srB: SrColumn = {
      name: user.partnerName.trim(),
      address: user.partnerAddress.trim(),
      driveMin: g.travelMitfahrer ? g.travelMinutes : (g.partnerTravel?.minutes ?? null),
      fee,
      pnv: 0,
      km: pKm,
      travel: pKm != null ? Math.round(pKm * pack.travel.kmRate * 100) / 100 : 0,
      team: false,
      other: 0,
    };
    writeColumn(w, POS.srB, srB, g);
    total += sumOf(srB);
  }

  w.text(fmtEur(total), POS.total, 'right');
  w.text([user.city, new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })].filter(Boolean).join(', '), POS.placeDate, 'center');
}

/**
 * Pro Spiel eine Seite: Original-Bogen als unterste Ebene, darüber eine separat erzeugte
 * Datenebene – beide werden zu einer Seite zusammengeführt.
 */
export async function buildReceiptPdf(opts: {
  user: ReceiptUserData;
  pack: RulePack;
  receipt: { id: number; season: string; total: number; createdAt: string };
  games: ReceiptGame[];
}): Promise<Buffer> {
  const formDoc = await PDFDocument.load(readFileSync(FORM_PATH));
  const formPage = formDoc.getPage(0);
  const { width, height } = formPage.getSize();

  // 1) Datenebene: eigene PDF, gleiche Seitengröße, nur Einträge
  const overlayDoc = await PDFDocument.create();
  const font = await overlayDoc.embedFont(StandardFonts.Helvetica);
  for (const g of opts.games) {
    const page = overlayDoc.addPage([width, height]);
    drawOverlay(page, font, g, opts.user, opts.pack);
  }

  // 2) Zusammenführen: Bogen unten, Daten oben
  const out = await PDFDocument.create();
  out.setTitle(`Reisekostenabrechnung Quittung ${opts.receipt.id}`);
  out.setAuthor(`${opts.user.firstName} ${opts.user.lastName}`.trim());
  out.setCreator('JDS Sports');
  const background = await out.embedPage(formPage);
  // pdf-lib schreibt eingebettete Schriften erst beim Speichern – daher Datenebene erst speichern, dann einbetten
  const overlay = await PDFDocument.load(await overlayDoc.save());
  const layers = await out.embedPages(overlay.getPages());
  for (const layer of layers) {
    const page = out.addPage([width, height]);
    page.drawPage(background, { x: 0, y: 0, width, height });
    page.drawPage(layer, { x: 0, y: 0, width, height });
  }
  return Buffer.from(await out.save());
}
