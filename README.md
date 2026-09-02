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
  Year view is a scrollable one-page-per-month overview you can click into.
  Public holidays, school breaks, and birthdays now show as actual text
  labels on the month view too, not just a color tint or a bare icon.
- **School year ▾** (top center) — switch between school years once you've
  added more than one (Settings → School years). The banner up top tells you
  when you're looking at a locked (read-only) year.
- **🌙/☀️** (top right) — toggle light/dark mode explicitly; it starts from
  your OS setting but remembers your choice per browser after that.
- **Sidebar** — tick/untick any kid, or a whole group ("Philipp & Johannes" /
  "Aleks & Luis"), to show or hide them on the calendar. Each kid has its own
  color swatch; click it to pick a different one, per kid. The number next
  to each kid's name is their day count for the month currently on screen —
  days with us in Dad's View, or days with the other parent in Mom's View;
  it updates live with the toggle (hover it to see which it's counting). On
  a phone, the ☰ button opens this as a slide-in panel.
- **👨 Dad's View / 👩 Mom's View** (formerly "Flip Selection") — shows the
  *same* selected kids' days with their *other* parent instead (e.g. Philipp
  & Johannes selected, switch to Mom's View, and you're looking at the days
  they're with their mother). Kid tags look identical either way (solid,
  each kid's own color) — the toggle itself, which turns purple/blue to
  match, is what tells you which view you're in. A PDF export carries that
  same label as a page title, since a printed page has no toggle to glance
  at.
- **Click any day** — set each kid's status for that day independently
  (With us / With the other parent), add a note, and add per-kid
  appointments (shown on the calendar as `Kid: Title`, in that kid's
  color). A kid is always either with you or with the other parent for
  that group (configurable in Settings → Groups) — there's no in-between
  "unconfirmed" state to maintain.
- **Export** (top right) — always matches whatever's currently on screen:
  the kids you have selected, and the month/week/school-year you're
  currently viewing.
  - *iCalendar (.ics)* — importable into Apple Calendar / Google Calendar /
    Outlook.
  - *PDF* — a snapshot of the current view; from Year view this is a
    **multi-page PDF, one full-size page per month** instead of one
    illegibly squished page. Every page prints a title with the month (or
    period) and which of Dad's/Mom's View it shows.
  - *PNG* — a single-image snapshot of the current view.

  Downloaded filenames use a full 4-digit year range for the whole school
  year (`kidscheduler-schoolyear-2026-2027-...`) rather than the display
  label's shorthand ("2026/27"), which read ambiguously in a filename.

## Settings (⚙ top right)

- **Kids** — add a kid (e.g. when your 1-year-old is ready to be tracked),
  edit name/group/color/birthday, or deactivate one without losing history.
  "Class" (e.g. `1A`, `MSK`) is optional and only used by appointment
  import (below) to tell that kid's events apart from other classes'.
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
- **Appearance** — pick your own accent color for the public-holiday and
  school-break tinting (legend swatch, day background, and text label all
  follow it) instead of the built-in green shades. "Reset" goes back to the
  default, and it still adapts sensibly between light and dark mode.
- **Public holidays (Vienna, Austria)** — "Sync from date.nager.at" pulls
  official national/Vienna public holidays for a given year from the free
  [date.nager.at](https://date.nager.at) API, **plus Mother's Day and
  Father's Day** (computed locally as the 2nd Sunday of May/June — they're
  observances, not statutory holidays, so that feed doesn't carry them;
  they show with a 💐/👔 icon and don't mark the day as school-free). This
  does **not** include school break periods (Ferien) — those aren't public
  holidays and there's no reliable free feed for them, so add/edit those
  manually just below.
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

  A class newsletter usually lists events for the whole school, not just
  one kid's class — so if a row mentions a different class or grade than
  the target kid's Class setting, it's unchecked by default in the preview
  (with a note explaining why) so it doesn't get imported by mistake. Both
  forms of wording are recognized: a specific code (`3A`, `4B`, `MSK`) and a
  grade-level phrase (`für die 3.+ 4.Klassen`, `Verabschiedung der 4.
  Klassen`) — grade is read off the leading digit of the kid's Class (e.g.
  `1A` → grade 1). "alle Klassen" ("all classes") always stays checked.
  Set each kid's Class in the Kids section above for this to kick in.

  The "All appointments" table further down is fully editable (date, title,
  notes) — the fastest way to clean up a row that OCR misread before you
  spot it on the calendar, without deleting and re-adding it.

## Optional: PDF import (OCR)

The scanned-PDF appointment importer needs two system packages that aren't
required for anything else in the app:

```bash
# Debian/Ubuntu/Raspberry Pi OS
sudo apt install poppler-utils tesseract-ocr tesseract-ocr-deu

# macOS
brew install poppler tesseract tesseract-lang
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
