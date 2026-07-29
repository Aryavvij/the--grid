// ─── iCalendar (RFC 5545) generation ──────────────────────────────────────────
// Hand-rolled rather than pulled from a dependency: the subset we emit is small
// and the folding/escaping rules are the only fiddly part.

/** Escape a text value: backslash, semicolon, comma and newline are special. */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 requires lines <= 75 octets, continued with a leading space. */
function fold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 74) { out.push(cur); cur = ' '; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.join('\r\n');
}

const stampUTC = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = d => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');

/** Deterministic UID so re-subscribing updates events rather than duplicating. */
function uid(kind, id) { return `${kind}-${id}@grid`; }

function vevent({ id, kind, title, description, start, end, allDay, rrule, tz }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid(kind, id)}`, `DTSTAMP:${stampUTC(new Date())}`];
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`);
    const e = new Date(start); e.setDate(e.getDate() + 1);   // DTEND is exclusive
    lines.push(`DTEND;VALUE=DATE:${dateOnly(e)}`);
  } else if (tz) {
    // Floating local time — the phone renders it in its own zone, which is what
    // a weekly timetable block means ("09:00 wherever I am").
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
  } else {
    lines.push(`DTSTART:${stampUTC(start)}`);
    lines.push(`DTEND:${stampUTC(end || start)}`);
  }
  lines.push(`SUMMARY:${esc(title)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (rrule) lines.push(`RRULE:${rrule}`);
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

/** Local-time stamp (no Z) for floating recurring events. */
function localStamp(dateStr, hour) {
  return dateStr.replace(/-/g, '') + 'T' + String(hour).padStart(2, '0') + '0000';
}

/** Next occurrence of a weekday (0=Mon..6=Sun) on/after today, as YYYY-MM-DD. */
function nextWeekday(dayIndex) {
  const d = new Date();
  const jsDow = d.getDay() === 0 ? 6 : d.getDay() - 1;   // convert to Mon-first
  d.setDate(d.getDate() + ((dayIndex - jsDow + 7) % 7));
  return d.toISOString().slice(0, 10);
}

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/**
 * Build the full calendar document.
 * `opts` toggles which layers are published.
 */
function buildCalendar({ name, events = [], blocks = [], tasks = [], gymDays = [], opts = {} }) {
  const out = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Grid//Personal OS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name || 'The Grid')}`,
    // Hint to clients how often to poll; iOS ultimately decides.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  if (opts.events !== false) {
    events.forEach(e => out.push(vevent({
      id: e.id, kind: 'ev', title: e.title, description: e.description,
      start: e.startTime, end: e.endTime || e.startTime, allDay: e.allDay,
    })));
  }

  if (opts.timetable !== false) {
    blocks.forEach(b => {
      const day = nextWeekday(b.dayIndex);
      out.push(vevent({
        id: `${b.dayIndex}-${b.startHour}-${b.label}`, kind: 'tt',
        title: String(b.label).replace(/_/g, ' '),
        description: 'Grid timetable block',
        start: localStamp(day, b.startHour),
        end:   localStamp(day, Math.min(b.endHour, 23)) ,
        tz: true,
        rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[b.dayIndex]}`,
      }));
    });
  }

  if (opts.deadlines !== false) {
    tasks.filter(t => t.deadline && !t.done).forEach(t => out.push(vevent({
      id: t.id, kind: 'task', title: `Due: ${t.name}`,
      description: `Grid task · ${t.category || 'general'}`,
      start: t.deadline, allDay: true,
    })));
  }

  if (opts.gym === true) {
    gymDays.forEach(g => {
      const day = nextWeekday(g.dayIndex);
      out.push(vevent({
        id: `${g.dayIndex}-${g.title}`, kind: 'gym',
        title: `Gym: ${g.title}`, description: 'Grid gym split',
        start: localStamp(day, 18), end: localStamp(day, 19), tz: true,
        rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[g.dayIndex]}`,
      }));
    });
  }

  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

module.exports = { buildCalendar };
