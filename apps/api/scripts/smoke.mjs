const BASE = 'http://localhost:8787';
const DEMO = { email: 'demo@jds-sports.de', password: 'demo1234' };

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DEMO),
  });
  const login = await loginRes.json();
  if (!login.token) throw new Error('Login fehlgeschlagen: ' + JSON.stringify(login));
  const auth = { Authorization: `Bearer ${login.token}` };
  console.log('LOGIN ok:', login.user.first_name, login.user.last_name);

  const analyze = async (filename) => {
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(`samples/${filename}`);
    const fd = new FormData();
    fd.append('source', 'nuliga');
    fd.append('file', new Blob([buf], { type: 'text/calendar' }), filename);
    const res = await fetch(`${BASE}/api/import/analyze`, { method: 'POST', headers: auth, body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error('analyze: ' + JSON.stringify(json));
    return json;
  };

  const a1 = await analyze('sample-nuliga.ics');
  console.log(`ANALYZE 1: neu=${a1.new} geaendert=${a1.changed} unveraendert=${a1.unchanged}`);
  const a1ToApply = a1.items.filter((i) => i.action !== 'unchanged');
  if (a1ToApply.length > 0) {
    const applyRes = await fetch(`${BASE}/api/import/apply`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'nuliga', items: a1ToApply.map((i) => i.draft) }),
    });
    const apply = await applyRes.json();
    if (!applyRes.ok) throw new Error('apply: ' + JSON.stringify(apply));
    console.log('APPLY 1:', JSON.stringify(apply));
  } else {
    console.log('APPLY 1: übersprungen (alles unveraendert)');
  }

  const a2 = await analyze('sample-nuliga-update.ics');
  console.log(`ANALYZE 2 (Update-Datei): neu=${a2.new} geaendert=${a2.changed} unveraendert=${a2.unchanged}`);
  for (const item of a2.items) {
    console.log(`   [${item.action}] ${item.draft.gameDatetime} ${item.draft.homeTeam} Änderungen: ${item.changes.join(', ') || '–'}`);
  }

  const a2ToApply = a2.items.filter((i) => i.action !== 'unchanged');
  if (a2ToApply.length > 0) {
    const apply2Res = await fetch(`${BASE}/api/import/apply`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'nuliga', items: a2ToApply.map((i) => i.draft) }),
    });
    const apply2 = await apply2Res.json();
    if (!apply2Res.ok) throw new Error('apply2: ' + JSON.stringify(apply2));
    console.log('APPLY 2:', JSON.stringify(apply2));
  }

  const listRes = await fetch(`${BASE}/api/assignments`, { headers: auth });
  const list = await listRes.json();
  const imported = list.assignments.filter((a) => a.source === 'nuliga');
  console.log('IMPORTIERTE EINSÄTZE:', imported.length);
  for (const a of imported) {
    console.log(`   ${a.gameDatetime} | ${a.homeTeam} - ${a.awayTeam} | ${a.league} | Status=${a.status} | ${a.expenseTotal ?? '-'} EUR`);
  }

  const verlegt = imported.find((a) => a.sourceUid === 'nuliga-hvs-2026-4471-1001');
  if (!verlegt || verlegt.status !== 'verlegt') throw new Error('Verlegung nicht korrekt übernommen!');
  const abgesagt = imported.find((a) => a.sourceUid === 'nuliga-hvs-2026-4471-1002');
  if (!abgesagt || abgesagt.status !== 'abgesagt') throw new Error('Absage nicht korrekt übernommen!');

  const detailRes = await fetch(`${BASE}/api/assignments/${verlegt.id}`, { headers: auth });
  const detail = await detailRes.json();
  console.log('DETAIL verlegter Einsatz: Status =', detail.assignment.status, '| Spesen =', detail.expense.total, 'EUR');
  console.log('   Breakdown:', detail.expense.breakdown.map((i) => `${i.label}: ${i.amount}`).join(' | '));

  const wed = imported.find((a) => a.sourceUid === 'nuliga-hvs-2026-4471-1005');
  const wedRes = await fetch(`${BASE}/api/assignments/${wed.id}`, { headers: auth });
  const wedDetail = await wedRes.json();
  console.log('DETAIL Wochenspiel (Mi):', wedDetail.expense.total, 'EUR =', wedDetail.expense.breakdown.map((i) => `${i.label} ${i.amount}`).join(' | '));

  const dashRes = await fetch(`${BASE}/api/reports/dashboard`, { headers: auth });
  const dash = await dashRes.json();
  console.log('DASHBOARD:', JSON.stringify(dash.totals));

  const csvRes = await fetch(`${BASE}/api/reports/export.csv`, { headers: auth });
  const csv = await csvRes.text();
  console.log('CSV Zeilen:', csv.split('\r\n').length, '| Header ok:', csv.includes('Datum;Uhrzeit'));

  console.log('\n--- Feature-Flags (Waffle) ---');
  const flagsRes = await fetch(`${BASE}/api/flags/active`, { headers: auth });
  const flags = (await flagsRes.json()).flags;
  console.log('AKTIV für Demo-User:', JSON.stringify(flags));

  const adminListRes = await fetch(`${BASE}/api/flags`, { headers: auth });
  const adminList = await adminListRes.json();
  if (!adminListRes.ok) throw new Error('Admin-Flag-Liste: ' + JSON.stringify(adminList));
  console.log('ADMIN-LISTE:', adminList.flags.map((f) => `${f.name}(${f.everyone === 1 ? 'everyone' : f.authenticated === 1 ? 'auth' : f.percent != null ? f.percent + '%' : 'custom'})`).join(', '));

  const createFlagRes = await fetch(`${BASE}/api/flags`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'smoke_test_flag', note: 'Smoke', percent: 0, clubs: ['TV Musterstadt'] }),
  });
  const createdFlag = await createFlagRes.json();
  if (!createFlagRes.ok) throw new Error('Flag-Create: ' + JSON.stringify(createdFlag));
  console.log('NEU: smoke_test_flag für Verein TV Musterstadt (Demo-User-Verein) →');

  const flagsRes2 = await fetch(`${BASE}/api/flags/active`, { headers: auth });
  const flags2 = (await flagsRes2.json()).flags;
  console.log('AKTIV danach:', JSON.stringify(flags2));
  if (flags2.smoke_test_flag !== true) throw new Error('Club-Targeting fehlgeschlagen!');

  const overrideRes = await fetch(`${BASE}/api/flags/active?dflag=-smoke_test_flag`, { headers: auth });
  const overrideFlags = (await overrideRes.json()).flags;
  console.log('OVERRIDE ?dflag=-smoke_test_flag →', overrideFlags.smoke_test_flag);
  if (overrideFlags.smoke_test_flag !== false) throw new Error('dflag-Override fehlgeschlagen!');

  const delRes = await fetch(`${BASE}/api/flags/${createdFlag.flag.id}`, { method: 'DELETE', headers: auth });
  console.log('DELETE Flag:', delRes.status);

  console.log('\n--- Handball360 CSV-Import (MISQUAD) ---');
  const analyzeCsv = async (filename) => {
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(`samples/${filename}`);
    const fd = new FormData();
    fd.append('source', 'nuliga');
    fd.append('file', new Blob([buf], { type: 'text/csv' }), filename);
    const res = await fetch(`${BASE}/api/import/analyze`, { method: 'POST', headers: auth, body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error('analyze csv: ' + JSON.stringify(json));
    return json;
  };
  const c1 = await analyzeCsv('sample-h360.csv');
  console.log(`CSV ANALYZE: quelle=${c1.source} neu=${c1.new} geaendert=${c1.changed} unveraendert=${c1.unchanged} gesamt=${c1.total}`);
  for (const item of c1.items.slice(0, 3)) {
    console.log(`   [${item.action}] ${item.draft.gameDatetime} ${item.draft.homeTeam} gg. ${item.draft.awayTeam} | ${item.draft.league} (Klasse=${item.draft.leagueKey}, Status=${item.draft.status})`);
  }
  if (c1.source !== 'handball360') throw new Error('CSV-Quelle nicht erkannt: ' + c1.source);
  if (c1.new !== 9) throw new Error('CSV: erwartet 9 neue Spiele, got ' + c1.new);

  const applyCsvRes = await fetch(`${BASE}/api/import/apply`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'handball360', items: c1.items.filter((i) => i.action !== 'unchanged').map((i) => i.draft) }),
  });
  const applyCsv = await applyCsvRes.json();
  if (!applyCsvRes.ok) throw new Error('apply csv: ' + JSON.stringify(applyCsv));
  console.log('CSV APPLY:', JSON.stringify(applyCsv));

  const csvListRes = await fetch(`${BASE}/api/assignments`, { headers: auth });
  const csvList = (await csvListRes.json()).assignments.filter((a) => a.source === 'handball360');
  console.log('H360-EINSÄTZE:', csvList.length);
  const abgeschl = csvList.find((a) => a.sourceUid === '2627SAROLAJWA0101');
  if (!abgeschl || abgeschl.status !== 'geleitet') throw new Error('H360 „Abgeschlossen" nicht als geleitet übernommen!');
  const olc = csvList.find((a) => a.sourceUid === '2627SAROLCJMA0503');
  if (!olc || olc.leagueKey !== 'oberliga_jugend_cd') throw new Error('H360 Jugend-Klasse nicht korrekt zugeordnet!');
  if (!olc || olc.expenseTotal !== 25) throw new Error('H360 Oberliga C-Jugend Spesen erwartet 25 EUR, got ' + (olc && olc.expenseTotal));
  console.log('   Abgeschlossen-Spiel -> Status geleitet ✓ | Oberliga C-Jugend -> 25 EUR ✓');

  console.log('\n--- Offizieller Abrechnungsbogen (PDF) ---');
  const listRes2 = await fetch(`${BASE}/api/receipts`, { headers: auth });
  const receipts = (await listRes2.json()).receipts;
  const pdfRes = await fetch(`${BASE}/api/receipts/${receipts[0].id}/pdf`, { headers: auth });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  if (!pdfRes.ok) throw new Error('PDF: HTTP ' + pdfRes.status);
  const pdfText = pdfBuf.toString('latin1');
  const hasFormTitle = pdfText.includes('Reisekostenabrechnung');
  console.log('PDF:', pdfBuf.length, 'Bytes | Titel „Reisekostenabrechnung":', hasFormTitle, '| Seiten (Pages):', (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length);

  console.log('\nSMOKE-TEST: ALLES OK');
}

main().catch((err) => {
  console.error('SMOKE-FEHLER:', err.message);
  process.exit(1);
});
