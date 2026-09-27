import { travelBetween } from '../src/modules/distance.ts';

const home = process.argv[2] ?? 'Niederwiesstraße 20, 66822 Lebach';
const halls = process.argv.slice(3).length ? process.argv.slice(3) : ['Sporthalle Uchtelfangen, 66557 Illingen', 'Sporthalle Kirkel, Am Sportzentrum 1, 66359 Kirkel'];
for (const h of halls) {
  try {
    console.log(h, '→', await travelBetween(home, h));
  } catch (err) {
    console.log(h, '→ FEHLER', (err as Error).message);
  }
}
