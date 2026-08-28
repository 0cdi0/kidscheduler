# Kid Scheduler

A local, iCal-styled custody calendar for our blended family (Philipp, Johannes,
Aleks, Luis) covering the 2026/27 school year, seeded from
`Jahresplanung_202627_Betreuungskalender.xlsx`.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 — from any device on the same network (e.g. a
phone or the other parent's laptop) it's `http://<this-machine's-LAN-IP>:3000`.

Both of you point at the same running server, so edits save to the one shared
`server/data/schedule.json` file immediately — no separate sync step.

This is plain Node + Express with no native dependencies, so the same code
runs unchanged on a Raspberry Pi later (just `npm install && npm start`, or
wire it up with `pm2`/systemd to keep it running in the background).

## Using it

- **Sidebar** — tick/untick any kid, or a whole group ("Philipp & Johannes" /
  "Aleks & Luis"), to show or hide them on the calendar. Each kid has its own
  color swatch; click it to pick a different one, per kid.
- **Flip Selection** — swaps who's currently shown for who's currently hidden
  (select your kids, hit Flip, and you're looking at your wife's kids' view).
- **Click any day** — set each kid's status for that day independently
  (Away / With us / Uncertain) and add a note. Siblings are seeded with the
  same days but can be moved apart at any time.
- **Export** (top right):
  - *iCalendar (.ics)* — the whole school year for the kids currently
    selected, importable into Apple Calendar / Google Calendar / Outlook.
  - *PDF* / *PNG* — a snapshot of the month currently on screen, for the
    current selection.

## Data

`server/data/schedule.json` is the single source of truth — back it up like
any other important file. `scripts/seed-from-xlsx.py` is the one-off script
used to generate the initial seed from the original spreadsheet; it's not
needed to run the app.
