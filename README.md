# Kid Scheduler

An iCal-styled custody calendar for our blended family (Philipp, Johannes,
Aleks, Luis — and any future kid), seeded from
`Jahresplanung_202627_Betreuungskalender.xlsx`. Runs as a small local Node
server so it can move from your own machine to a Raspberry Pi later without
any code changes.

## Run it

```bash
npm install
npm start
```

Open http://localhost:3000. The startup log also prints every LAN address
the server is reachable on, e.g. `http://<LAN-or-Tailscale-IP>:3000` — that's
the address to use from a phone or the other parent's laptop.

Both of you point at the same running server, so edits save to the one
shared `server/data/schedule.json` file immediately — no separate sync step.

## Syncing to your phones (Tailscale)

Since you already run Tailscale on the Pi and both phones, that's it —
install/run Kid Scheduler on the Pi, then open `http://<pi's-tailscale-IP>:3000`
from either phone's browser, from anywhere, fully editable. No port
forwarding, no public exposure. On each phone, use the browser's "Add to
Home Screen" — the app has a manifest/icon so it opens full-screen like a
real app, still pointed at the same Tailscale address.

## Using it

- **Month / Week / Year** view switcher, top center. Week view is the most
  detailed (shows who's with which parent and any appointments per day);
  Year view is a 12-month overview you can click into.
- **School year ▾** (top center) — switch between school years once you've
  added more than one (Settings → School years). The banner up top tells you
  when you're looking at a locked (read-only) year.
- **Sidebar** — tick/untick any kid, or a whole group ("Philipp & Johannes" /
  "Aleks & Luis"), to show or hide them on the calendar. Each kid has its own
  color swatch; click it to pick a different one, per kid. On a phone, the
  ☰ button opens this as a slide-in panel.
- **Flip Selection** — swaps who's currently shown for who's currently hidden
  (select your kids, hit Flip, and you're looking at your wife's kids' view).
- **Click any day** — set each kid's status for that day independently
  (With us / With the other parent), add a note, and add per-kid
  appointments. A kid is always either with you or with the other parent
  for that group (configurable in Settings → Groups) — there's no
  in-between "unconfirmed" state to maintain.
- **Export** (top right) — always matches whatever's currently on screen:
  the kids you have selected, and the month/week/school-year you're
  currently viewing.
  - *iCalendar (.ics)* — importable into Apple Calendar / Google Calendar /
    Outlook.
  - *PDF* / *PNG* — a snapshot of the current view.

## Settings (⚙ top right)

- **Kids** — add a kid (e.g. when your 1-year-old is ready to be tracked),
  edit name/group/color/birthday, or deactivate one without losing history.
- **Groups** — the two household "sides"; each has an "other parent" label
  used when a kid's day is left blank.
- **Family birthdays** — recurring annual birthdays for people who aren't
  tracked on the custody calendar (parents, grandparents, etc). Shown with
  a 🎂 every year without needing a specific year attached.
- **School years** — add next year when it's time; add a label + start/end
  date. A school year **auto-locks (read-only)** once a later one exists
  and today has moved past its end date — it's kept as a historical record.
  The "Lock" dropdown lets you force it locked or temporarily force it
  unlocked (e.g. to fix a mistake), or leave it on "Auto".
- **Public holidays (Vienna, Austria)** — "Sync from date.nager.at" pulls
  official national/Vienna public holidays for a given year from the free
  [date.nager.at](https://date.nager.at) API. This does **not** include
  school break periods (Ferien) — those aren't public holidays and there's
  no reliable free feed for them, so add/edit those manually just below.
- **Appointments** — one-off appointments per kid, added one at a time or
  bulk-imported two ways, both landing in the same editable preview (edit
  any date/title/note, or remove a row, before anything is actually saved):
  - *CSV/Excel* — columns `date, title, notes`; dates as `YYYY-MM-DD` or
    `DD.MM.YYYY`.
  - *Scanned/photographed PDF* — for a school notice with no selectable
    text. Runs OCR on the server (needs `poppler-utils` and `tesseract-ocr`
    with German language data installed there — see **Optional: PDF
    import** below). OCR on a real school flyer is never perfect, so
    always check the preview before importing; the raw extracted text is
    also shown so you can fix it and re-parse without re-uploading.

## Optional: PDF import (OCR)

The scanned-PDF appointment importer needs two system packages that aren't
required for anything else in the app:

```bash
sudo apt install poppler-utils tesseract-ocr tesseract-ocr-deu
```

Without these installed, every other feature works fine — you'll just get a
clear error if you try the PDF import path. CSV/Excel import needs nothing
extra.

## Data

`server/data/schedule.json` is the single source of truth — back it up like
any other important file. It's designed to keep every school year's data
forever (nothing is deleted when a year locks), so it's safe to keep
growing year over year. `scripts/seed-from-xlsx.py` and
`scripts/migrate-v2.py` are one-off scripts used to build/evolve the initial
seed from the original spreadsheet; they're not needed to run the app.
