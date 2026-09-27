export interface IcsEvent {
  uid: string;
  sequence: number;
  lastModified: string | null;
  dtStart: string;
  dtStartRaw: string;
  tzid: string | null;
  summary: string;
  description: string;
  location: string;
  status: string | null;
}

interface RawProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

function unfold(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const logical = normalized.replace(/\n[ \t]/g, '');
  return logical.split('\n').filter((l) => l.trim().length > 0);
}

function parseProp(line: string): RawProp | null {
  const m = line.match(/^([A-Za-z0-9-]+)((?:;[^:]*)*):([\s\S]*)$/);
  if (!m) return null;
  const name = m[1].toUpperCase();
  const params: Record<string, string> = {};
  const rawParams = m[2] ?? '';
  if (rawParams) {
    for (const p of rawParams.split(';').filter(Boolean)) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
  }
  return { name, params, value: m[3] };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function utcToBerlinLocal(utcMs: number): string {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return fmt.format(new Date(utcMs)).replace(' ', 'T');
}

function parseDtStart(prop: RawProp): { local: string; tzid: string | null } {
  const v = prop.value.trim();
  if (/^\d{8}$/.test(v)) {
    return { local: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00`, tzid: prop.params.TZID ?? null };
  }
  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return { local: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00`, tzid: prop.params.TZID ?? null };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) {
    return { local: new Date().toISOString().slice(0, 16), tzid: prop.params.TZID ?? null };
  }
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === 'Z') {
    const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    return { local: utcToBerlinLocal(utcMs), tzid: 'UTC' };
  }
  const tzid = prop.params.TZID ?? null;
  const local = `${y}-${mo}-${d}T${h}:${mi}`;
  if (tzid && !/berlin|cet|cest|europe/i.test(tzid)) {
    try {
      const probe = new Date(`${local}:00`);
      const inTz = new Intl.DateTimeFormat('sv-SE', {
        timeZone: tzid,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).format(probe).replace(' ', 'T');
      const asBerlin = new Date(`${inTz}:00Z`).getTime();
      if (!Number.isNaN(asBerlin)) {
        return { local: inTz, tzid };
      }
    } catch {
      // unbekannte TZID: behandle als Europe/Berlin
    }
  }
  return { local, tzid };
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];
  let current: Map<string, RawProp[]> | null = null;

  for (const line of lines) {
    const prop = parseProp(line);
    if (!prop) continue;
    if (prop.name === 'BEGIN' && prop.value.trim().toUpperCase() === 'VEVENT') {
      current = new Map();
    } else if (prop.name === 'END' && prop.value.trim().toUpperCase() === 'VEVENT') {
      if (current) {
        const get = (name: string) => current!.get(name)?.[0];
        const uidProp = get('UID');
        const dtProp = get('DTSTART');
        if (uidProp && dtProp) {
          const dt = parseDtStart(dtProp);
          const seqProp = get('SEQUENCE');
          events.push({
            uid: unescapeText(uidProp.value).trim(),
            sequence: seqProp ? Number(seqProp.value) || 0 : 0,
            lastModified: get('LAST-MODIFIED')?.value ?? null,
            dtStart: dt.local,
            dtStartRaw: dtProp.value,
            tzid: dt.tzid,
            summary: unescapeText(get('SUMMARY')?.value ?? ''),
            description: unescapeText(get('DESCRIPTION')?.value ?? ''),
            location: unescapeText(get('LOCATION')?.value ?? ''),
            status: get('STATUS')?.value.toUpperCase() ?? null,
          });
        }
      }
      current = null;
    } else if (current) {
      const list = current.get(prop.name) ?? [];
      list.push(prop);
      current.set(prop.name, list);
    }
  }
  return events;
}
