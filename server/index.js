const express = require('express');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data', 'schedule.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR));

function readSchedule() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function writeSchedule(data) {
  // Write atomically so a crash mid-write can't corrupt the shared file.
  const tmpPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, DATA_PATH);
}

const VALID_KID_STATUS = new Set(['with-us', 'uncertain']);

app.get('/api/schedule', (req, res) => {
  res.json(readSchedule());
});

app.put('/api/kids/:id', (req, res) => {
  const schedule = readSchedule();
  const kid = schedule.kids.find((k) => k.id === req.params.id);
  if (!kid) return res.status(404).json({ error: 'unknown kid' });

  const { name, color } = req.body || {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }
    kid.name = name.trim();
  }
  if (color !== undefined) {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return res.status(400).json({ error: 'color must be a #rrggbb hex string' });
    }
    kid.color = color;
  }

  writeSchedule(schedule);
  res.json(kid);
});

app.put('/api/days/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  const schedule = readSchedule();
  const validKidIds = new Set(schedule.kids.map((k) => k.id));
  const existing = schedule.days[date] || {
    kids: {},
    holiday: null,
    schoolBreak: null,
    birthdays: [],
    notes: null,
  };

  const { kids, notes } = req.body || {};
  if (kids !== undefined) {
    if (typeof kids !== 'object' || kids === null || Array.isArray(kids)) {
      return res.status(400).json({ error: 'kids must be an object' });
    }
    for (const [kidId, status] of Object.entries(kids)) {
      if (!validKidIds.has(kidId)) {
        return res.status(400).json({ error: `unknown kid: ${kidId}` });
      }
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
    if (notes !== null && typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string or null' });
    }
    existing.notes = notes;
  }

  schedule.days[date] = existing;
  writeSchedule(schedule);
  res.json(existing);
});

app.listen(PORT, () => {
  console.log(`Kid Scheduler running at http://localhost:${PORT}`);
});
