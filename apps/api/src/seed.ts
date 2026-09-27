import bcrypt from 'bcryptjs';
import { db } from './db.ts';
import { createAssignment, recalcUser } from './modules/assignmentService.ts';
import { createReceipt } from './modules/receiptService.ts';

export async function seedDemoData(): Promise<void> {
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const hash = bcrypt.hashSync('demo1234', 10);
  const r = db
    .prepare(
      `INSERT INTO users (email, password_hash, first_name, last_name, street, zip, city, phone, iban, club, default_role, partner_name, partner_address, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'demo@jds-sports.de',
      hash,
      'Max',
      'Muster',
      'Musterstraße 12',
      '66333',
      'Musterstadt',
      '0151 23456789',
      'DE02120300000000202051',
      'TV Musterstadt',
      'sr1',
      'Tina Partnerin',
      'Beispielweg 3, 66333 Musterstadt',
      1
    );
  const userId = Number(r.lastInsertRowid);

  const games: Parameters<typeof createAssignment>[1][] = [
    {
      game_datetime: '2026-09-05T16:00',
      home_team: 'TV Kirkel',
      away_team: 'SG Blieskastel',
      league: 'Bezirksliga',
      league_key: 'bezirksliga',
      competition_type: 'championship',
      hall: 'Sportzentrum Kirkel',
      hall_address: 'Sportzentrum Kirkel, Am Sportzentrum 1, 66359 Kirkel',
      role: 'sr1',
      status: 'geleitet',
      travel_km: 24,
    },
    {
      game_datetime: '2026-09-09T20:00',
      home_team: 'HSG Saarpfalz',
      away_team: 'TV Homburg',
      league: 'Verbandsliga',
      league_key: 'verbandsliga',
      competition_type: 'championship',
      hall: 'Halle Neunkirchen',
      hall_address: 'Halle Neunkirchen, Goebenstraße 20, 66538 Neunkirchen',
      role: 'sr1',
      status: 'geleitet',
      travel_km: 32,
    },
    {
      game_datetime: '2026-09-12T18:30',
      home_team: 'HSG Saarburg',
      away_team: 'HG Saarlouis',
      league: 'Oberliga Saar',
      league_key: 'oberliga',
      competition_type: 'championship',
      hall: 'Sporthalle Saarburg',
      hall_address: 'Sporthalle Saarburg, Am Sportplatz, 66740 Saarburg',
      role: 'sr1',
      status: 'geleitet',
      travel_km: 38,
    },
    {
      game_datetime: '2026-09-19T16:00',
      home_team: 'HSG Neunkirchen/Kirrberg',
      away_team: 'TuS Merzig',
      league: 'Saarpokal 1. Runde',
      league_key: null,
      competition_type: 'cup',
      cup_round: 'r1',
      hall: 'Erich-Kästner-Halle',
      hall_address: 'Erich-Kästner-Halle, Goebenstraße, 66538 Neunkirchen',
      role: 'sr1',
      status: 'bestätigt',
      travel_km: 36,
    },
    {
      game_datetime: '2026-09-26T17:00',
      home_team: 'SG Falkenstein',
      away_team: 'TV Uhweiler',
      league: 'A-Liga',
      league_key: 'a_liga',
      competition_type: 'championship',
      hall: 'Sporthalle Falkenstein',
      hall_address: 'Sporthalle Falkenstein, Pfalzstraße 8, 66482 Falkenstein',
      role: 'sr2',
      status: 'angesetzt',
      travel_km: null,
    },
    {
      game_datetime: '2026-10-03T14:00',
      home_team: 'JSG Blieskastel',
      away_team: 'HSG Völklingen',
      league: 'Bezirksliga Jugend A/B',
      league_key: 'bezirksliga_jugend_ab',
      competition_type: 'championship',
      hall: 'Sporthalle Bous',
      hall_address: 'Sporthalle Bous, Saarbrücker Straße 30, 66763 Bous',
      role: 'sr1',
      status: 'bestätigt',
      travel_km: 18,
    },
    {
      game_datetime: '2026-10-03T15:45',
      home_team: 'SV Bous',
      away_team: 'TG Saarbrücken',
      league: 'Bezirksliga',
      league_key: 'bezirksliga',
      competition_type: 'championship',
      hall: 'Sporthalle Bous',
      hall_address: 'Sporthalle Bous, Saarbrücker Straße 30, 66763 Bous',
      role: 'sr1',
      status: 'bestätigt',
      travel_km: 18,
    },
  ];

  const ids: number[] = [];
  for (const g of games) ids.push(createAssignment(userId, g));
  recalcUser(userId);

  try {
    await createReceipt(userId, [ids[0]]);
  } catch {
    // Demo-Quittung optional
  }
}
