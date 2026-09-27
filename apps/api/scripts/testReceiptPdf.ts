import { readFileSync, writeFileSync } from 'node:fs';
import { buildReceiptPdf } from '../src/pdf/receiptPdf.ts';
import type { RulePack } from '../src/modules/rules.ts';

// Nachbau des von Hand ausgefüllten Beispiel-Bogens (Spiel 21001644) zum Sichtvergleich
const pack = JSON.parse(readFileSync('data/rulepacks/HVS_2026_27.json', 'utf8')) as RulePack;
const out = process.argv[2] ?? 'test-abrechnung.pdf';

const pdf = await buildReceiptPdf({
  pack,
  receipt: { id: 0, season: '2025/26', total: 50.4, createdAt: '' },
  user: {
    firstName: 'Joel', lastName: 'Nicolay', club: '', street: 'Niederwiesstraße 20', zip: '66822', city: 'Lebach', iban: '',
    partnerName: 'Otto, Simon', partnerAddress: 'Birkenweg 38, 66127 Saarbrücken',
  },
  games: [{
    id: 1, sourceUid: 'nuliga-hvs-2025-21001644', gameDatetime: '2026-02-28T14:00', homeTeam: 'JSG Saarbrücken W.', awayTeam: 'HC Perl',
    league: 'Oberliga Saar männliche C-Jugend', leagueKey: 'oberliga_jugend_cd', competitionType: 'championship', cupRound: null,
    tournamentGroup: null, tournamentTier: null, gamesCount: 1, hall: '210048', hallAddress: 'Sporthalle, 66121 Saarbrücken',
    role: 'sr1', status: 'geleitet', notes: 'Spielnummer 21001644', travelMitfahrer: false, travelKm: 68, travelMinutes: 55,
    partnerTravel: { km: 16, minutes: 15 },
    calc: {
      total: 50.4, warnings: [], travelKmEffective: 68,
      items: [
        { key: 'base', label: 'Spielleitung', amount: 30 },
        { key: 'travel', label: 'Fahrtkosten', amount: 20.4 },
      ],
    },
  }],
});
writeFileSync(out, pdf);
console.log('geschrieben:', out);
