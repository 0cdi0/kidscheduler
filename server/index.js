const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DATA_PATH = path.join(__dirname, 'data', 'schedule.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(PUBLIC_DIR));

function readSchedule() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function writeSchedule(data) {
  const tmpPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, DATA_PATH);
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'item';
}

function uniqueId(base, existingIds) {
  let id = base;
  let n = 2;
  while (existingIds.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function isValidBirthday(s) {
  return s === null || s === undefined || /^\d{2}-\d{2}$/.test(s);
}

function isValidHex(s) {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

function schoolYearForDate(schedule, iso) {
  return schedule.schoolYears.find((sy) => iso >= sy.start && iso <= sy.end) || null;
}

// A school year is read-only once a later school year has been added AND
// today has moved past this year's end date - i.e. "the new school year has
// started". `lockOverride` (true/false) lets an admin force it either way,
// e.g. to temporarily unlock a finished year and fix a mistake.
function effectiveLock(schedule, year) {
  if (year.lockOverride === true) return true;
  if (year.lockOverride === false) return false;
  const todayISO = new Date().toISOString().slice(0, 10);
  const hasNextYear = schedule.schoolYears.some((y) => y.id !== year.id && y.start > year.end);
  return hasNextYear && todayISO > year.end;
}

function withComputedLocks(schedule) {
  return { ...schedule, schoolYears: schedule.schoolYears.map((y) => ({ ...y, locked: effectiveLock(schedule, y) })) };
}

function schoolYearForDateLocked(schedule, iso) {
  const year = schoolYearForDate(schedule, iso);
  return year ? { ...year, locked: effectiveLock(schedule, year) } : null;
}

const VALID_KID_STATUS = new Set(['with-us', 'uncertain']);

// ---------------- Schedule ----------------

app.get('/api/schedule', (req, res) => {
  res.json(withComputedLocks(readSchedule()));
});

// ---------------- Kids ----------------

app.post('/api/kids', (req, res) => {
  const { name, group, color, birthday } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const schedule = readSchedule();
  if (group !== undefined && group !== null && !schedule.groups.some((g) => g.id === group)) {
    return res.status(400).json({ error: `unknown group: ${group}` });
  }
  if (color !== undefined && !isValidHex(color)) {
    return res.status(400).json({ error: 'color must be a #rrggbb hex string' });
  }
  if (!isValidBirthday(birthday)) {
    return res.status(400).json({ error: 'birthday must be MM-DD' });
  }

  const id = uniqueId(slugify(name), new Set(schedule.kids.map((k) => k.id)));
  const kid = {
    id,
    name: name.trim(),
    group: group || null,
    color: color || '#8E8E93',
    birthday: birthday || null,
    active: true,
  };
  schedule.kids.push(kid);
  writeSchedule(schedule);
  res.status(201).json(kid);
});

app.put('/api/kids/:id', (req, res) => {
  const schedule = readSchedule();
  const kid = schedule.kids.find((k) => k.id === req.params.id);
  if (!kid) return res.status(404).json({ error: 'unknown kid' });

  const { name, color, birthday, group, active } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name must be a non-empty string' });
    kid.name = name.trim();
  }
  if (color !== undefined) {
    if (!isValidHex(color)) return res.status(400).json({ error: 'color must be a #rrggbb hex string' });
    kid.color = color;
  }
  if (birthday !== undefined) {
    if (!isValidBirthday(birthday)) return res.status(400).json({ error: 'birthday must be MM-DD' });
    kid.birthday = birthday;
  }
  if (group !== undefined) {
    if (group !== null && !schedule.groups.some((g) => g.id === group)) {
      return res.status(400).json({ error: `unknown group: ${group}` });
    }
    kid.group = group;
  }
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active must be boolean' });
    kid.active = active;
  }

  writeSchedule(schedule);
  res.json(kid);
});

// ---------------- Groups ----------------

app.post('/api/groups', (req, res) => {
  const { label, otherParentLabel } = req.body || {};
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  const schedule = readSchedule();
  const id = uniqueId(slugify(label), new Set(schedule.groups.map((g) => g.id)));
  const group = { id, label: label.trim(), otherParentLabel: otherParentLabel || 'the other parent' };
  schedule.groups.push(group);
  writeSchedule(schedule);
  res.status(201).json(group);
});

app.put('/api/groups/:id', (req, res) => {
  const schedule = readSchedule();
  const group = schedule.groups.find((g) => g.id === req.params.id);
  if (!group) return res.status(404).json({ error: 'unknown group' });
  const { label, otherParentLabel } = req.body || {};
  if (label !== undefined) {
    if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label must be a non-empty string' });
    group.label = label.trim();
  }
  if (otherParentLabel !== undefined) group.otherParentLabel = otherParentLabel;
  writeSchedule(schedule);
  res.json(group);
});

// ---------------- People (non-kid recurring birthdays) ----------------

app.post('/api/people', (req, res) => {
  const { name, birthday, note } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!isValidBirthday(birthday)) return res.status(400).json({ error: 'birthday must be MM-DD' });
  const schedule = readSchedule();
  const id = uniqueId(slugify(name), new Set(schedule.people.map((p) => p.id)));
  const person = { id, name: name.trim(), birthday: birthday || null, note: note || null, active: true };
  schedule.people.push(person);
  writeSchedule(schedule);
  res.status(201).json(person);
});

app.put('/api/people/:id', (req, res) => {
  const schedule = readSchedule();
  const person = schedule.people.find((p) => p.id === req.params.id);
  if (!person) return res.status(404).json({ error: 'unknown person' });
  const { name, birthday, note, active } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name must be a non-empty string' });
    person.name = name.trim();
  }
  if (birthday !== undefined) {
    if (!isValidBirthday(birthday)) return res.status(400).json({ error: 'birthday must be MM-DD' });
    person.birthday = birthday;
  }
  if (note !== undefined) person.note = note;
  if (active !== undefined) {
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'active must be boolean' });
    person.active = active;
  }
  writeSchedule(schedule);
  res.json(person);
});

// ---------------- School years ----------------

app.post('/api/school-years', (req, res) => {
  const { label, start, end } = req.body || {};
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (!isValidDate(start) || !isValidDate(end) || start >= end) {
    return res.status(400).json({ error: 'start/end must be valid YYYY-MM-DD with start before end' });
  }
  const schedule = readSchedule();
  const id = uniqueId(slugify(label), new Set(schedule.schoolYears.map((y) => y.id)));
  const schoolYear = { id, label: label.trim(), start, end, lockOverride: null };
  schedule.schoolYears.push(schoolYear);
  schedule.schoolYears.sort((a, b) => a.start.localeCompare(b.start));
  writeSchedule(schedule);
  res.status(201).json({ ...schoolYear, locked: effectiveLock(schedule, schoolYear) });
});

app.put('/api/school-years/:id', (req, res) => {
  const schedule = readSchedule();
  const year = schedule.schoolYears.find((y) => y.id === req.params.id);
  if (!year) return res.status(404).json({ error: 'unknown school year' });
  const { label, start, end, lockOverride } = req.body || {};
  if (label !== undefined) {
    if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label must be a non-empty string' });
    year.label = label.trim();
  }
  if (start !== undefined) {
    if (!isValidDate(start)) return res.status(400).json({ error: 'start must be YYYY-MM-DD' });
    year.start = start;
  }
  if (end !== undefined) {
    if (!isValidDate(end)) return res.status(400).json({ error: 'end must be YYYY-MM-DD' });
    year.end = end;
  }
  if (year.start >= year.end) return res.status(400).json({ error: 'start must be before end' });
  if (lockOverride !== undefined) {
    if (lockOverride !== null && typeof lockOverride !== 'boolean') {
      return res.status(400).json({ error: 'lockOverride must be true, false, or null' });
    }
    year.lockOverride = lockOverride;
  }
  writeSchedule(schedule);
  res.json({ ...year, locked: effectiveLock(schedule, year) });
});

// ---------------- Days (custody) ----------------

app.put('/api/days/:date', (req, res) => {
  const { date } = req.params;
  if (!isValidDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

  const schedule = readSchedule();
  const year = schoolYearForDateLocked(schedule, date);
  if (year && year.locked) {
    return res.status(423).json({ error: `${year.label} is locked (read-only)` });
  }

  const validKidIds = new Set(schedule.kids.map((k) => k.id));
  const existing = schedule.days[date] || { kids: {}, notes: null };

  const { kids, notes } = req.body || {};
  if (kids !== undefined) {
    if (typeof kids !== 'object' || kids === null || Array.isArray(kids)) {
      return res.status(400).json({ error: 'kids must be an object' });
    }
    for (const [kidId, status] of Object.entries(kids)) {
      if (!validKidIds.has(kidId)) return res.status(400).json({ error: `unknown kid: ${kidId}` });
      if (status !== null && !VALID_KID_STATUS.has(status)) {
        return res.status(400).json({ error: `invalid status for ${kidId}: ${status}` });
      }
    }
    existing.kids = { ...existing.kids };
    for (const [kidId, status] of Object.entries(kids)) {
      if (status === null) delete existing.kids[kidId];
      else existing.kids[kidId] = status;
    }
  }
  if (notes !== undefined) {
    if (notes !== null && typeof notes !== 'string') return res.status(400).json({ error: 'notes must be a string or null' });
    existing.notes = notes;
  }

  schedule.days[date] = existing;
  writeSchedule(schedule);
  res.json(existing);
});

// ---------------- Holidays ----------------

app.post('/api/holidays', (req, res) => {
  const { date, label } = req.body || {};
  if (!isValidDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  const schedule = readSchedule();
  const holiday = { id: crypto.randomUUID(), date, label: label.trim(), source: 'manual' };
  schedule.holidays.push(holiday);
  writeSchedule(schedule);
  res.status(201).json(holiday);
});

app.delete('/api/holidays/:id', (req, res) => {
  const schedule = readSchedule();
  const before = schedule.holidays.length;
  schedule.holidays = schedule.holidays.filter((h) => h.id !== req.params.id);
  if (schedule.holidays.length === before) return res.status(404).json({ error: 'unknown holiday' });
  writeSchedule(schedule);
  res.status(204).end();
});

// Public holidays for Austria/Vienna via the free Nager.Date API.
// Only touches entries this endpoint itself created (source: "nager") for
// the requested year, so manually-added or imported holidays are untouched.
app.post('/api/holidays/sync', async (req, res) => {
  const year = Number((req.body && req.body.year) || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'year must be a reasonable 4-digit year' });
  }

  let holidays;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/AT`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Nager.Date responded with ${response.status}`);
    holidays = await response.json();
  } catch (err) {
    return res.status(502).json({ error: `Could not reach date.nager.at: ${err.message}` });
  }

  const schedule = readSchedule();
  schedule.holidays = schedule.holidays.filter((h) => !(h.source === 'nager' && h.date.startsWith(String(year))));
  for (const h of holidays) {
    // Vienna is subdivision AT-9; a null "counties" list means it applies nationwide.
    if (h.counties && !h.counties.includes('AT-9')) continue;
    schedule.holidays.push({ id: crypto.randomUUID(), date: h.date, label: h.localName, source: 'nager' });
  }
  schedule.settings.publicHolidaySync.lastSyncedYear = year;
  schedule.settings.publicHolidaySync.lastSyncedAt = new Date().toISOString();
  writeSchedule(schedule);
  res.json({ year, imported: holidays.length, holidays: schedule.holidays.filter((h) => h.date.startsWith(String(year))) });
});

// ---------------- School breaks ----------------

app.post('/api/school-breaks', (req, res) => {
  const { label, start, end } = req.body || {};
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (!isValidDate(start) || !isValidDate(end) || start > end) {
    return res.status(400).json({ error: 'start/end must be valid YYYY-MM-DD with start on or before end' });
  }
  const schedule = readSchedule();
  const brk = { id: crypto.randomUUID(), label: label.trim(), start, end };
  schedule.schoolBreaks.push(brk);
  writeSchedule(schedule);
  res.status(201).json(brk);
});

app.put('/api/school-breaks/:id', (req, res) => {
  const schedule = readSchedule();
  const brk = schedule.schoolBreaks.find((b) => b.id === req.params.id);
  if (!brk) return res.status(404).json({ error: 'unknown school break' });
  const { label, start, end } = req.body || {};
  if (label !== undefined) {
    if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label must be a non-empty string' });
    brk.label = label.trim();
  }
  if (start !== undefined) {
    if (!isValidDate(start)) return res.status(400).json({ error: 'start must be YYYY-MM-DD' });
    brk.start = start;
  }
  if (end !== undefined) {
    if (!isValidDate(end)) return res.status(400).json({ error: 'end must be YYYY-MM-DD' });
    brk.end = end;
  }
  if (brk.start > brk.end) return res.status(400).json({ error: 'start must be on or before end' });
  writeSchedule(schedule);
  res.json(brk);
});

app.delete('/api/school-breaks/:id', (req, res) => {
  const schedule = readSchedule();
  const before = schedule.schoolBreaks.length;
  schedule.schoolBreaks = schedule.schoolBreaks.filter((b) => b.id !== req.params.id);
  if (schedule.schoolBreaks.length === before) return res.status(404).json({ error: 'unknown school break' });
  writeSchedule(schedule);
  res.status(204).end();
});

// ---------------- Appointments ----------------

function validateAppointmentInput(body, schedule) {
  const { kidId, date, title, notes } = body || {};
  if (!schedule.kids.some((k) => k.id === kidId)) return `unknown kid: ${kidId}`;
  if (!isValidDate(date)) return 'date must be YYYY-MM-DD';
  if (typeof title !== 'string' || !title.trim()) return 'title is required';
  if (notes !== undefined && notes !== null && typeof notes !== 'string') return 'notes must be a string';
  return null;
}

app.post('/api/appointments', (req, res) => {
  const schedule = readSchedule();
  const err = validateAppointmentInput(req.body, schedule);
  if (err) return res.status(400).json({ error: err });

  const year = schoolYearForDateLocked(schedule, req.body.date);
  if (year && year.locked) return res.status(423).json({ error: `${year.label} is locked (read-only)` });

  const appt = {
    id: crypto.randomUUID(),
    kidId: req.body.kidId,
    date: req.body.date,
    title: req.body.title.trim(),
    notes: req.body.notes || null,
    source: req.body.source || 'manual',
  };
  schedule.appointments.push(appt);
  writeSchedule(schedule);
  res.status(201).json(appt);
});

app.post('/api/appointments/import', (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows must be a non-empty array' });

  const schedule = readSchedule();
  const results = [];
  const created = [];
  rows.forEach((row, i) => {
    const err = validateAppointmentInput(row, schedule);
    if (err) {
      results.push({ row: i, ok: false, error: err });
      return;
    }
    const year = schoolYearForDateLocked(schedule, row.date);
    if (year && year.locked) {
      results.push({ row: i, ok: false, error: `${year.label} is locked (read-only)` });
      return;
    }
    const appt = {
      id: crypto.randomUUID(),
      kidId: row.kidId,
      date: row.date,
      title: row.title.trim(),
      notes: row.notes || null,
      source: row.source || 'import',
    };
    schedule.appointments.push(appt);
    created.push(appt);
    results.push({ row: i, ok: true, appointment: appt });
  });

  if (created.length) writeSchedule(schedule);
  res.json({ importedCount: created.length, results });
});

app.put('/api/appointments/:id', (req, res) => {
  const schedule = readSchedule();
  const appt = schedule.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: 'unknown appointment' });

  const year = schoolYearForDateLocked(schedule, appt.date);
  if (year && year.locked) return res.status(423).json({ error: `${year.label} is locked (read-only)` });

  const { date, title, notes } = req.body || {};
  if (date !== undefined) {
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const newYear = schoolYearForDateLocked(schedule, date);
    if (newYear && newYear.locked) return res.status(423).json({ error: `${newYear.label} is locked (read-only)` });
    appt.date = date;
  }
  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'title must be a non-empty string' });
    appt.title = title.trim();
  }
  if (notes !== undefined) appt.notes = notes;

  writeSchedule(schedule);
  res.json(appt);
});

app.delete('/api/appointments/:id', (req, res) => {
  const schedule = readSchedule();
  const appt = schedule.appointments.find((a) => a.id === req.params.id);
  if (!appt) return res.status(404).json({ error: 'unknown appointment' });
  const year = schoolYearForDateLocked(schedule, appt.date);
  if (year && year.locked) return res.status(423).json({ error: `${year.label} is locked (read-only)` });
  schedule.appointments = schedule.appointments.filter((a) => a.id !== req.params.id);
  writeSchedule(schedule);
  res.status(204).end();
});

// ---------------- Startup ----------------

function localNetworkAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const ifaceList of Object.values(nets)) {
    for (const iface of ifaceList || []) {
      if (iface.family === 'IPv4' && !iface.internal) addrs.push(iface.address);
    }
  }
  return addrs;
}

app.listen(PORT, () => {
  console.log(`Kid Scheduler running at http://localhost:${PORT}`);
  for (const addr of localNetworkAddresses()) {
    console.log(`  also reachable at http://${addr}:${PORT} (e.g. over Tailscale/LAN)`);
  }
});
