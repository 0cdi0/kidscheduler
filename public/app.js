(() => {
  'use strict';

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const WEEKDAYS_MIN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const STATUS_ORDER = ['away', 'with-us'];
  const STORAGE_KEY = 'kidscheduler.selectedKids';
  const OTHER_PARENT_STORAGE_KEY = 'kidscheduler.showOtherParent';
  const THEME_STORAGE_KEY = 'kidscheduler.theme';

  let schedule = null;
  let selectedKids = new Set();
  // false = show each selected kid's with-us days (the normal view).
  // true  = "Flip Selection": show that SAME set of kids' with-the-other-
  // parent days instead - e.g. with Philipp & Johannes selected, flipping
  // shows the days they're with their mother, not a different pair of kids.
  let showOtherParent = false;
  let view = 'month'; // 'month' | 'week' | 'year'
  let focusDate = new Date(); // anchors month/week/year navigation
  let currentSchoolYearId = null;
  let modalDate = null;
  let modalDraft = null; // { kids: {id: status}, notes }

  const el = (id) => document.getElementById(id);

  // ---------------- Data loading ----------------

  async function loadSchedule() {
    const res = await fetch('/api/schedule');
    if (!res.ok) throw new Error('Failed to load schedule');
    schedule = await res.json();
    applyAppearanceSettings();
  }

  // Mixes accentHex into baseHex at the given ratio (0-1), in plain hex.
  // Deliberately NOT using CSS color-mix() here: html2canvas (which drives
  // PDF/PNG export) can't parse that function and throws on any exported
  // view containing a holiday/break day.
  function mixHex(accentHex, baseHex, ratio) {
    const a = accentHex.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
    const b = baseHex.match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
    return '#' + a.map((v, i) => Math.round(v * ratio + b[i] * (1 - ratio)).toString(16).padStart(2, '0')).join('');
  }

  function applyAppearanceSettings() {
    const appearance = (schedule.settings && schedule.settings.appearance) || {};
    const root = document.documentElement;
    const dark = currentEffectiveTheme() === 'dark';
    const holidayAccent = appearance.holidayColor || (dark ? '#ff5c5c' : '#c1121f');
    const breakAccent = appearance.breakColor || (dark ? '#ff8f6b' : '#e07856');
    const panel = dark ? '#242426' : '#ffffff';
    root.style.setProperty('--holiday-accent', holidayAccent);
    root.style.setProperty('--holiday-bg', mixHex(holidayAccent, panel, 0.18));
    root.style.setProperty('--break-accent', breakAccent);
    root.style.setProperty('--break-bg', mixHex(breakAccent, panel, 0.16));
  }

  async function apiPut(url, body) {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  async function apiPost(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  }

  async function apiDelete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
  }

  // ---------------- Selection state ----------------

  function activeKids() { return schedule.kids.filter((k) => k.active !== false); }
  function kidById(id) { return schedule.kids.find((k) => k.id === id); }
  function groupById(id) { return schedule.groups.find((g) => g.id === id); }

  function loadSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids = JSON.parse(raw).filter((id) => activeKids().some((k) => k.id === id));
        if (ids.length) return new Set(ids);
      }
    } catch (e) { /* fall through */ }
    return new Set(activeKids().map((k) => k.id));
  }

  function persistSelection() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedKids]));
  }

  // ---------------- Date helpers ----------------

  function pad2(n) { return String(n).padStart(2, '0'); }
  function toISO(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
  function isoOfDate(d) { return toISO(d.getFullYear(), d.getMonth(), d.getDate()); }
  function isoToday() { return isoOfDate(new Date()); }
  function parseISO(iso) { return new Date(iso + 'T00:00:00'); }
  function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOfDate(d); }

  function schoolYearForISO(iso) {
    if (!iso) return null;
    return schedule.schoolYears.find((sy) => iso >= sy.start && iso <= sy.end) || null;
  }

  function otherParentLabelFor(kid) {
    if (!kid.group) return null;
    const group = groupById(kid.group);
    return group ? group.otherParentLabel : null;
  }

  function birthdayPeopleForISO(iso) {
    const mmdd = iso.slice(5); // 'MM-DD'
    const matches = [];
    for (const kid of activeKids()) {
      if (kid.birthday === mmdd) matches.push(kid.name);
    }
    for (const person of schedule.people.filter((p) => p.active !== false)) {
      if (person.birthday === mmdd) matches.push(person.name);
    }
    return matches;
  }

  // Returns the full holiday entry (not just its label) so callers can tell
  // a real day-off holiday apart from an "observance" like Mother's/Father's
  // Day - those are worth marking on the calendar but don't mean school's
  // out, so they shouldn't tint the day the way a real holiday does.
  function holidayForISO(iso) {
    return schedule.holidays.find((x) => x.date === iso) || null;
  }

  function schoolBreakForISO(iso) {
    const b = schedule.schoolBreaks.find((x) => iso >= x.start && iso <= x.end);
    return b ? b.label : null;
  }

  function appointmentsForISO(iso) {
    return schedule.appointments.filter((a) => a.date === iso);
  }

  // Monday-first 6x7 grid of {iso, day, inMonth}
  function buildMonthGrid(year, month) {
    const firstOfMonth = new Date(year, month, 1);
    const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - mondayOffset);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push({ iso: isoOfDate(d), day: d.getDate(), inMonth: d.getMonth() === month });
    }
    return cells;
  }

  function startOfWeekMonday(d) {
    const copy = new Date(d);
    const offset = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - offset);
    return copy;
  }

  // ---------------- School year navigation ----------------

  function sortedSchoolYears() {
    return [...schedule.schoolYears].sort((a, b) => a.start.localeCompare(b.start));
  }

  function currentSchoolYear() {
    return schedule.schoolYears.find((y) => y.id === currentSchoolYearId) || null;
  }

  function syncSchoolYearToFocus() {
    const iso = isoOfDate(focusDate);
    const match = schoolYearForISO(iso);
    if (match) currentSchoolYearId = match.id;
  }

  // ---------------- Rendering: sidebar ----------------

  function renderSidebar() {
    const container = el('kidGroups');
    container.innerHTML = '';

    const kids = activeKids();
    const groupsUsed = schedule.groups.filter((g) => kids.some((k) => k.group === g.id));

    for (const group of groupsUsed) {
      const groupKids = kids.filter((k) => k.group === group.id);
      const groupEl = document.createElement('div');
      groupEl.className = 'kid-group';

      const groupRow = document.createElement('label');
      groupRow.className = 'group-row';
      const groupCheckbox = document.createElement('input');
      groupCheckbox.type = 'checkbox';
      groupRow.appendChild(groupCheckbox);
      groupRow.appendChild(Object.assign(document.createElement('span'), { textContent: group.label }));
      groupEl.appendChild(groupRow);

      groupCheckbox.addEventListener('change', () => {
        for (const kid of groupKids) {
          if (groupCheckbox.checked) selectedKids.add(kid.id);
          else selectedKids.delete(kid.id);
        }
        persistSelection();
        renderAll();
      });

      for (const kid of groupKids) groupEl.appendChild(renderKidRow(kid));

      const states = groupKids.map((k) => selectedKids.has(k.id));
      groupCheckbox.checked = states.every(Boolean);
      groupCheckbox.indeterminate = states.some(Boolean) && !states.every(Boolean);

      container.appendChild(groupEl);
    }

    const ungrouped = kids.filter((k) => !k.group);
    if (ungrouped.length) {
      const groupEl = document.createElement('div');
      groupEl.className = 'kid-group';
      const heading = document.createElement('div');
      heading.className = 'group-row';
      heading.style.fontWeight = '600';
      heading.textContent = 'Other';
      groupEl.appendChild(heading);
      for (const kid of ungrouped) groupEl.appendChild(renderKidRow(kid));
      container.appendChild(groupEl);
    }
  }

  function renderKidRow(kid) {
    const row = document.createElement('div');
    row.className = 'kid-row';

    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'kid-checkbox';
    cb.checked = selectedKids.has(kid.id);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedKids.add(kid.id);
      else selectedKids.delete(kid.id);
      persistSelection();
      renderAll();
    });

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = kid.color;

    const name = document.createElement('span');
    name.className = 'kid-name';
    name.textContent = kid.name;
    if (kid.birthday) {
      const [mm, dd] = kid.birthday.split('-');
      const monthName = new Date(2000, Number(mm) - 1, 1).toLocaleDateString('en-US', { month: 'short' });
      name.title = `Birthday: ${monthName} ${Number(dd)}`;
    }

    label.appendChild(cb);
    label.appendChild(swatch);
    label.appendChild(name);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'color-input';
    colorInput.value = kid.color;
    colorInput.title = `${kid.name}'s color`;
    colorInput.addEventListener('change', async () => {
      kid.color = colorInput.value;
      swatch.style.background = kid.color;
      renderAll();
      try { await apiPut(`/api/kids/${kid.id}`, { color: kid.color }); }
      catch (e) { alert('Could not save color to server.'); }
    });

    const count = document.createElement('span');
    count.className = 'kid-count';
    count.textContent = countKidDaysInMonth(kid);
    count.title = showOtherParent ? `Days with ${otherParentLabelFor(kid) || 'the other parent'} this month` : 'Days with us this month';

    row.appendChild(label);
    row.appendChild(colorInput);
    row.appendChild(count);
    return row;
  }

  // Counts the current parent view's days (with us, or with the other
  // parent when flipped) for the focused month - kept in sync with the
  // Dad's/Mom's View toggle so it answers "how many days this month".
  function countKidDaysInMonth(kid) {
    const y = focusDate.getFullYear();
    const m = focusDate.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    let n = 0;
    for (let d = 1; d <= lastDay; d++) {
      if (kidShownOnDay(kid, schedule.days[toISO(y, m, d)])) n++;
    }
    return n;
  }

  // ---------------- Top bar: title, banner, year dropdown ----------------

  function renderTopbar() {
    document.querySelectorAll('#viewSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));

    let title = '';
    if (view === 'month') {
      title = focusDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (view === 'week') {
      const start = startOfWeekMonday(focusDate);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      title = `${startLabel} \u2013 ${endLabel}`;
    } else {
      const sy = currentSchoolYear();
      title = sy ? sy.label : String(focusDate.getFullYear());
    }
    el('periodTitle').textContent = title;

    // The banner always reflects the school year picked in the dropdown
    // (kept in sync with whatever's on screen via syncSchoolYearToFocus),
    // rather than re-deriving it from the visible range - a visible month or
    // week can have almost no overlap with its school year at a year
    // boundary (e.g. a view of Aug 31 alone), which made date-anchored
    // lookups unreliable right at that edge.
    const bannerYear = currentSchoolYear();
    el('lockedBanner').classList.toggle('hidden', !(bannerYear && bannerYear.locked));
    el('yearMenuBtn').textContent = (bannerYear ? bannerYear.label : 'School year') + ' \u25be';

    const dropdown = el('yearDropdown');
    dropdown.innerHTML = '';
    for (const sy of sortedSchoolYears()) {
      const row = document.createElement('div');
      row.className = 'year-dropdown-row' + (sy.id === currentSchoolYearId ? ' current' : '');
      row.innerHTML = `<span>${sy.label}</span>` + (sy.locked ? '<span class="lock-icon">&#128274; locked</span>' : '');
      row.addEventListener('click', () => {
        currentSchoolYearId = sy.id;
        focusDate = parseISO(sy.start);
        el('yearDropdown').classList.add('hidden');
        renderAll();
      });
      dropdown.appendChild(row);
    }
  }

  // ---------------- Rendering: month view ----------------

  function renderWeekdayRow() {
    const row = el('weekdayRow');
    row.innerHTML = '';
    for (const w of WEEKDAYS) row.appendChild(Object.assign(document.createElement('div'), { textContent: w }));
  }

  // Same solid style whether we're in Dad's or Mom's View - the toggle
  // itself (and, on exports, the page title) is what tells you which
  // perspective you're looking at, so the tag doesn't need its own
  // dashed/outlined variant (which read as harder to scan at a glance).
  function buildKidTag(kid) {
    const tag = document.createElement('div');
    tag.className = 'kid-tag';
    tag.style.background = kid.color;
    tag.textContent = kid.name;
    return tag;
  }

  function buildApptTag(appt, kid) {
    const tag = document.createElement('div');
    tag.className = 'appt-tag';
    if (kid) tag.style.borderLeftColor = kid.color;
    tag.textContent = `${kid ? kid.name + ': ' : ''}${appt.title}`;
    if (appt.notes) tag.title = appt.notes;
    return tag;
  }

  // Days a selected kid is shown on, given the current Flip Selection state:
  // normally the days they're with us; flipped, the days they're not.
  function kidShownOnDay(kid, dayData) {
    const present = !!(dayData && dayData.kids && dayData.kids[kid.id]);
    return showOtherParent ? !present : present;
  }

  function renderMonthView() {
    const grid = el('calendarGrid');
    grid.innerHTML = '';
    const year = focusDate.getFullYear();
    const month = focusDate.getMonth();
    const cells = buildMonthGrid(year, month);
    const today = isoToday();

    for (const cell of cells) {
      const dayData = schedule.days[cell.iso];
      const holiday = holidayForISO(cell.iso);
      const isRealHoliday = holiday && holiday.source !== 'observance';
      const observance = holiday && holiday.source === 'observance' ? holiday : null;
      const brk = schoolBreakForISO(cell.iso);
      const birthdays = birthdayPeopleForISO(cell.iso);
      const appts = appointmentsForISO(cell.iso).filter((a) => selectedKids.has(a.kidId));

      const cellEl = document.createElement('div');
      cellEl.className = 'day-cell';
      if (!cell.inMonth) cellEl.classList.add('other-month');
      if (cell.iso === today) cellEl.classList.add('today');
      if (isRealHoliday) cellEl.classList.add('holiday');
      if (brk) cellEl.classList.add('break');

      const titleBits = [holiday && holiday.label, brk, dayData && dayData.notes].filter(Boolean);
      if (titleBits.length) cellEl.title = titleBits.join(' \u00b7 ');

      const dayNumber = document.createElement('div');
      dayNumber.className = 'day-number';
      dayNumber.textContent = cell.day;
      cellEl.appendChild(dayNumber);

      if (isRealHoliday) cellEl.appendChild(Object.assign(document.createElement('div'), { className: 'day-label holiday-label', textContent: holiday.label }));
      else if (brk) cellEl.appendChild(Object.assign(document.createElement('div'), { className: 'day-label break-label', textContent: brk }));

      if (birthdays.length || observance) {
        const bits = [];
        if (birthdays.length) bits.push('\u{1F382} ' + birthdays.join(', '));
        if (observance) bits.push(observance.label);
        const cake = document.createElement('div');
        cake.className = 'day-cake';
        cake.textContent = bits.join(' \u00b7 ');
        cellEl.appendChild(cake);
      }

      const tags = document.createElement('div');
      tags.className = 'day-kid-tags';
      for (const kid of activeKids()) {
        if (!selectedKids.has(kid.id)) continue;
        if (!kidShownOnDay(kid, dayData)) continue;
        tags.appendChild(buildKidTag(kid));
      }
      for (const appt of appts) tags.appendChild(buildApptTag(appt, kidById(appt.kidId)));
      cellEl.appendChild(tags);

      if (dayData && dayData.notes) {
        const dot = document.createElement('div');
        dot.className = 'day-note-dot';
        cellEl.appendChild(dot);
      }

      cellEl.addEventListener('click', () => openDayModal(cell.iso));
      grid.appendChild(cellEl);
    }
  }

  // ---------------- Rendering: week view ----------------

  function renderWeekView() {
    const grid = el('weekGrid');
    grid.innerHTML = '';
    const start = startOfWeekMonday(focusDate);
    const today = isoToday();

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = isoOfDate(d);
      const dayData = schedule.days[iso];
      const holiday = holidayForISO(iso);
      const brk = schoolBreakForISO(iso);
      const birthdays = birthdayPeopleForISO(iso);
      const observance = holiday && holiday.source === 'observance' ? holiday : null;
      const isRealHoliday = holiday && !observance;
      const appts = appointmentsForISO(iso).filter((a) => selectedKids.has(a.kidId));

      const col = document.createElement('div');
      col.className = 'week-day';
      if (isRealHoliday) col.classList.add('holiday');
      if (brk) col.classList.add('break');
      if (iso === today) col.classList.add('today');

      const head = document.createElement('div');
      head.className = 'week-day-head';
      head.innerHTML = `<span>${WEEKDAYS[i]}</span><span class="week-day-num">${d.getDate()}</span>`;
      col.appendChild(head);

      if (isRealHoliday) col.appendChild(Object.assign(document.createElement('div'), { className: 'week-note', textContent: '\u{1F1E6}\u{1F1F9} ' + holiday.label }));
      if (brk) col.appendChild(Object.assign(document.createElement('div'), { className: 'week-note', textContent: brk }));
      if (birthdays.length) col.appendChild(Object.assign(document.createElement('div'), { className: 'week-cake', textContent: '\u{1F382} ' + birthdays.join(', ') }));
      if (observance) col.appendChild(Object.assign(document.createElement('div'), { className: 'week-cake', textContent: observance.label }));

      for (const kid of activeKids()) {
        if (!selectedKids.has(kid.id)) continue;
        const present = !!(dayData && dayData.kids && dayData.kids[kid.id]);
        // Flip Selection re-emphasizes the with-other-parent state instead
        // of hiding the with-us one - both are still shown either way.
        const primary = showOtherParent ? !present : present;
        const row = document.createElement('div');
        if (primary) {
          row.className = 'week-kid-row';
          row.style.background = kid.color;
          row.textContent = kid.name;
        } else {
          const otherLabel = otherParentLabelFor(kid);
          row.className = 'week-kid-row ghost';
          row.textContent = otherLabel ? `${kid.name}: with ${otherLabel}` : `${kid.name}: away`;
        }
        col.appendChild(row);
      }

      for (const appt of appts) {
        const kid = kidById(appt.kidId);
        const line = document.createElement('div');
        line.className = 'week-appt';
        if (kid) line.style.borderLeftColor = kid.color;
        line.textContent = `${kid ? kid.name + ': ' : ''}${appt.title}`;
        col.appendChild(line);
      }

      if (dayData && dayData.notes) {
        col.appendChild(Object.assign(document.createElement('div'), { className: 'week-note', textContent: dayData.notes }));
      }

      col.addEventListener('click', () => openDayModal(iso));
      grid.appendChild(col);
    }
  }

  // ---------------- Rendering: year view ----------------

  function renderYearView() {
    const grid = el('yearGrid');
    grid.innerHTML = '';
    const sy = currentSchoolYear();
    const startMonth = sy ? parseISO(sy.start) : new Date(focusDate.getFullYear(), 0, 1);
    const monthCount = sy
      ? (parseISO(sy.end).getFullYear() - startMonth.getFullYear()) * 12 + (parseISO(sy.end).getMonth() - startMonth.getMonth()) + 1
      : 12;
    const today = isoToday();

    for (let i = 0; i < monthCount; i++) {
      const y = startMonth.getFullYear() + Math.floor((startMonth.getMonth() + i) / 12);
      const m = (startMonth.getMonth() + i) % 12;

      const mini = document.createElement('div');
      mini.className = 'mini-month';

      const titleEl = document.createElement('div');
      titleEl.className = 'mini-month-title';
      titleEl.textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      titleEl.addEventListener('click', () => { focusDate = new Date(y, m, 1); view = 'month'; renderAll(); });
      mini.appendChild(titleEl);

      const weekdaysEl = document.createElement('div');
      weekdaysEl.className = 'mini-weekdays';
      for (const w of WEEKDAYS_MIN) weekdaysEl.appendChild(Object.assign(document.createElement('div'), { textContent: w }));
      mini.appendChild(weekdaysEl);

      const daysEl = document.createElement('div');
      daysEl.className = 'mini-days';
      for (const cell of buildMonthGrid(y, m)) {
        const dayData = schedule.days[cell.iso];
        const holiday = holidayForISO(cell.iso);
        const isRealHoliday = holiday && holiday.source !== 'observance';
        const brk = schoolBreakForISO(cell.iso);
        const dayEl = document.createElement('div');
        dayEl.className = 'mini-day';
        if (!cell.inMonth) dayEl.classList.add('other-month');
        if (cell.iso === today) dayEl.classList.add('today');
        if (isRealHoliday) dayEl.classList.add('holiday');
        if (brk) dayEl.classList.add('break');
        dayEl.textContent = cell.day;

        if (cell.inMonth) {
          const dots = document.createElement('div');
          dots.className = 'mini-dots';
          for (const kid of activeKids()) {
            if (!selectedKids.has(kid.id)) continue;
            if (kidShownOnDay(kid, dayData)) {
              const dot = document.createElement('span');
              dot.className = 'mini-dot';
              dot.style.background = kid.color;
              dots.appendChild(dot);
            }
          }
          dayEl.appendChild(dots);
        }

        dayEl.addEventListener('click', () => { focusDate = parseISO(cell.iso); view = 'month'; renderAll(); });
        daysEl.appendChild(dayEl);
      }
      mini.appendChild(daysEl);
      grid.appendChild(mini);
    }
  }

  // ---------------- Day modal ----------------

  function openDayModal(iso) {
    modalDate = iso;
    const existing = schedule.days[iso] || { kids: {}, notes: null };
    modalDraft = { kids: { ...existing.kids }, notes: existing.notes || '' };
    const locked = !!(schoolYearForISO(iso) && schoolYearForISO(iso).locked);

    el('modalDate').textContent = parseISO(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    el('modalLockedNotice').classList.toggle('hidden', !locked);
    el('modalNotes').disabled = locked;
    el('modalSave').classList.toggle('hidden', locked);

    const rows = el('modalKidRows');
    rows.innerHTML = '';
    for (const kid of activeKids()) {
      const row = document.createElement('div');
      row.className = 'modal-kid-row';

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = kid.color;

      const name = document.createElement('span');
      name.className = 'kid-name';
      name.textContent = kid.name;

      const otherLabel = otherParentLabelFor(kid);
      const labels = { away: otherLabel ? `With ${otherLabel}` : 'Away', 'with-us': 'With us' };

      const seg = document.createElement('div');
      seg.className = 'segmented';
      for (const status of STATUS_ORDER) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = labels[status];
        btn.disabled = locked;
        const current = modalDraft.kids[kid.id] || 'away';
        if (current === status) { btn.classList.add('active'); btn.style.background = kid.color; }
        btn.addEventListener('click', () => {
          if (status === 'away') delete modalDraft.kids[kid.id];
          else modalDraft.kids[kid.id] = status;
          refreshModalKidRow(kid, seg, labels);
        });
        seg.appendChild(btn);
      }

      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(seg);
      rows.appendChild(row);
    }

    el('modalNotes').value = modalDraft.notes;
    renderModalAppointments(iso, locked);
    el('dayModal').classList.remove('hidden');
  }

  function refreshModalKidRow(kid, segEl, labels) {
    const current = modalDraft.kids[kid.id] || 'away';
    [...segEl.children].forEach((btn, i) => {
      const status = STATUS_ORDER[i];
      btn.classList.toggle('active', status === current);
      btn.style.background = status === current ? kid.color : '';
    });
  }

  function renderModalAppointments(iso, locked) {
    const container = el('modalAppointments');
    container.innerHTML = '';
    for (const kid of activeKids()) {
      const appts = schedule.appointments.filter((a) => a.kidId === kid.id && a.date === iso);
      const group = document.createElement('div');
      group.className = 'appt-kid-group';
      const label = document.createElement('div');
      label.className = 'appt-kid-group-label';
      label.textContent = `${kid.name}'s appointments`;
      group.appendChild(label);

      for (const appt of appts) {
        const item = document.createElement('div');
        item.className = 'appt-item';
        const title = document.createElement('span');
        title.className = 'appt-title';
        title.textContent = appt.title;
        item.appendChild(title);
        const del = document.createElement('button');
        del.textContent = '\u00d7';
        del.disabled = locked;
        del.title = 'Remove appointment';
        del.addEventListener('click', async () => {
          try { await apiDelete(`/api/appointments/${appt.id}`); schedule.appointments = schedule.appointments.filter((a) => a.id !== appt.id); renderModalAppointments(iso, locked); renderAll(); }
          catch (e) { alert(e.message); }
        });
        item.appendChild(del);
        group.appendChild(item);
      }

      if (!locked) {
        const addRow = document.createElement('div');
        addRow.className = 'appt-add-row';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Add appointment (e.g. Dentist 3pm)';
        const addBtn = document.createElement('button');
        addBtn.className = 'btn small';
        addBtn.textContent = 'Add';
        addBtn.addEventListener('click', async () => {
          const title = input.value.trim();
          if (!title) return;
          try {
            const appt = await apiPost('/api/appointments', { kidId: kid.id, date: iso, title });
            schedule.appointments.push(appt);
            renderModalAppointments(iso, locked);
            renderAll();
          } catch (e) { alert(e.message); }
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtn.click(); });
        addRow.appendChild(input);
        addRow.appendChild(addBtn);
        group.appendChild(addRow);
      }

      container.appendChild(group);
    }
  }

  function closeDayModal() {
    el('dayModal').classList.add('hidden');
    modalDate = null;
    modalDraft = null;
  }

  async function saveDayModal() {
    if (!modalDate) return;
    const notes = el('modalNotes').value.trim() || null;
    const patchKids = {};
    for (const kid of activeKids()) patchKids[kid.id] = modalDraft.kids[kid.id] || null;
    try {
      const saved = await apiPut(`/api/days/${modalDate}`, { kids: patchKids, notes });
      schedule.days[modalDate] = saved;
      closeDayModal();
      renderAll();
    } catch (e) {
      alert(e.message || 'Could not save that day to the server.');
    }
  }

  // ---------------- Navigation ----------------

  function goPrev() {
    if (view === 'month') focusDate = new Date(focusDate.getFullYear(), focusDate.getMonth() - 1, 1);
    else if (view === 'week') { const d = new Date(focusDate); d.setDate(d.getDate() - 7); focusDate = d; }
    else {
      const years = sortedSchoolYears();
      const idx = years.findIndex((y) => y.id === currentSchoolYearId);
      if (idx > 0) { currentSchoolYearId = years[idx - 1].id; focusDate = parseISO(years[idx - 1].start); }
    }
    syncSchoolYearToFocus();
    renderAll();
  }

  function goNext() {
    if (view === 'month') focusDate = new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 1);
    else if (view === 'week') { const d = new Date(focusDate); d.setDate(d.getDate() + 7); focusDate = d; }
    else {
      const years = sortedSchoolYears();
      const idx = years.findIndex((y) => y.id === currentSchoolYearId);
      if (idx >= 0 && idx < years.length - 1) { currentSchoolYearId = years[idx + 1].id; focusDate = parseISO(years[idx + 1].start); }
    }
    syncSchoolYearToFocus();
    renderAll();
  }

  function goToday() {
    focusDate = new Date();
    syncSchoolYearToFocus();
    if (view === 'year' && !schoolYearForISO(isoToday())) {
      const years = sortedSchoolYears();
      if (years.length) currentSchoolYearId = years[0].id;
    }
    renderAll();
  }

  function setView(next) {
    view = next;
    syncSchoolYearToFocus();
    renderAll();
  }

  // ---------------- Selection actions ----------------

  function selectAll() { selectedKids = new Set(activeKids().map((k) => k.id)); persistSelection(); renderAll(); }
  function clearAll() { selectedKids = new Set(); persistSelection(); renderAll(); }
  function setOtherParentView(next) {
    showOtherParent = next;
    try { localStorage.setItem(OTHER_PARENT_STORAGE_KEY, showOtherParent ? '1' : '0'); } catch (e) { /* ignore */ }
    updateParentViewToggle();
    renderAll();
  }

  function updateParentViewToggle() {
    const toggle = el('parentViewToggle');
    if (!toggle) return;
    toggle.querySelector('.dad').classList.toggle('active', !showOtherParent);
    toggle.querySelector('.mom').classList.toggle('active', showOtherParent);
  }

  // ---------------- Export ----------------

  function slugSelection() {
    const names = activeKids().filter((k) => selectedKids.has(k.id)).map((k) => k.name);
    return (names.length ? names.join('-') : 'none').toLowerCase().replace(/[^a-z0-9-]+/g, '');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  }

  // The date range for the view currently on screen, so "Export" always
  // means "what I'm looking at right now" - a month, a week, or (for Year,
  // which already shows a whole school year) that year.
  function currentViewRange() {
    if (view === 'month') {
      const y = focusDate.getFullYear();
      const m = focusDate.getMonth();
      return [toISO(y, m, 1), toISO(y, m, new Date(y, m + 1, 0).getDate())];
    }
    if (view === 'week') {
      const start = startOfWeekMonday(focusDate);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return [isoOfDate(start), isoOfDate(end)];
    }
    const sy = currentSchoolYear();
    return sy ? [sy.start, sy.end] : [null, null];
  }

  function exportICS() {
    const [rangeStart, rangeEnd] = currentViewRange();
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kid Scheduler//EN', 'CALSCALE:GREGORIAN'];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const isoDates = Object.keys(schedule.days)
      .filter((iso) => !rangeStart || (iso >= rangeStart && iso <= rangeEnd))
      .sort();
    for (const iso of isoDates) {
      const day = schedule.days[iso];
      for (const kid of activeKids()) {
        if (!selectedKids.has(kid.id)) continue;
        if (!kidShownOnDay(kid, day)) continue;
        const dateCompact = iso.replace(/-/g, '');
        const endCompact = addDays(iso, 1).replace(/-/g, '');
        const otherLabel = otherParentLabelFor(kid);
        const summary = showOtherParent && otherLabel ? `${kid.name} (with ${otherLabel})` : kid.name;
        lines.push(
          'BEGIN:VEVENT',
          `UID:${dateCompact}-${kid.id}-${showOtherParent ? 'other' : 'us'}@kidscheduler.local`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${dateCompact}`,
          `DTEND;VALUE=DATE:${endCompact}`,
          `SUMMARY:${icsEscape(summary)}`,
          `CATEGORIES:${icsEscape(kid.name)}`,
          'END:VEVENT'
        );
      }
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    downloadBlob(blob, `kidscheduler-${viewSlug()}-${slugSelection()}.ics`);
  }

  function currentViewElement() {
    if (view === 'month') return el('monthView');
    if (view === 'week') return el('weekView');
    return el('yearView');
  }

  async function captureViewCanvas() {
    return html2canvas(currentViewElement(), {
      backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1.5),
    });
  }

  function viewSlug() {
    if (view === 'month') return focusDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toLowerCase().replace(/\s+/g, '-');
    if (view === 'week') return `week-of-${isoOfDate(startOfWeekMonday(focusDate))}`;
    const sy = currentSchoolYear();
    // Full 4-digit years read more clearly in a filename than the display
    // label's shorthand (e.g. "schoolyear-2026-2027" instead of "2026-27",
    // which can look like a truncated date rather than a year range).
    return sy ? `schoolyear-${sy.start.slice(0, 4)}-${sy.end.slice(0, 4)}` : 'year';
  }

  async function exportPNG() {
    const btn = el('exportBtn');
    btn.disabled = true;
    try {
      const canvas = await captureViewCanvas();
      canvas.toBlob((blob) => downloadBlob(blob, `kidscheduler-${viewSlug()}-${slugSelection()}.png`), 'image/png');
    } catch (e) { alert('PNG export failed.'); }
    finally { btn.disabled = false; }
  }

  function parentViewLabel() {
    return showOtherParent ? "Mom's View" : "Dad's View";
  }

  // A printed/shared PDF has no topbar to glance at, so each page prints
  // its own title - which month, and which of Dad's/Mom's View it shows -
  // since tags themselves no longer look different between the two.
  function addCanvasAsPage(pdf, canvas, isFirstPage, title) {
    if (!isFirstPage) {
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      pdf.addPage('a4', orientation);
    }
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const titleHeight = title ? 28 : 0;
    if (title) {
      pdf.setFontSize(14);
      pdf.setTextColor('#1c1c1e');
      pdf.text(title, pageWidth / 2, 20, { align: 'center' });
    }
    const availableHeight = pageHeight - titleHeight;
    const ratio = Math.min(pageWidth / canvas.width, availableHeight / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageWidth - w) / 2, titleHeight + (availableHeight - h) / 2, w, h);
  }

  // Year view crammed onto one page is illegible, so instead render every
  // month of the currently-selected school year at full month-view size (as
  // if you'd paged through each one) and put each on its own PDF page.
  async function exportYearPDF() {
    const savedView = view;
    const savedFocus = focusDate;
    const sy = currentSchoolYear();
    const startMonth = sy ? parseISO(sy.start) : new Date(focusDate.getFullYear(), 0, 1);
    const monthCount = sy
      ? (parseISO(sy.end).getFullYear() - startMonth.getFullYear()) * 12 + (parseISO(sy.end).getMonth() - startMonth.getMonth()) + 1
      : 12;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    view = 'month';
    // renderMonthView() only repaints the grid inside #monthView - it
    // doesn't touch the hidden/visible toggling renderAll() normally does
    // for the view switcher, so #monthView is still display:none from
    // being in Year view. html2canvas can't capture a hidden element.
    el('monthView').classList.remove('hidden');
    el('weekView').classList.add('hidden');
    el('yearView').classList.add('hidden');
    for (let i = 0; i < monthCount; i++) {
      const y = startMonth.getFullYear() + Math.floor((startMonth.getMonth() + i) / 12);
      const m = (startMonth.getMonth() + i) % 12;
      focusDate = new Date(y, m, 1);
      renderMonthView();
      await new Promise((r) => requestAnimationFrame(r));
      const canvas = await html2canvas(el('monthView'), {
        backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
      });
      const monthLabel = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      addCanvasAsPage(pdf, canvas, i === 0, `${monthLabel} · ${parentViewLabel()}`);
    }

    view = savedView;
    focusDate = savedFocus;
    renderAll();

    pdf.save(`kidscheduler-${viewSlug()}-${slugSelection()}.pdf`);
  }

  async function exportPDF() {
    const btn = el('exportBtn');
    btn.disabled = true;
    try {
      if (view === 'year') {
        await exportYearPDF();
      } else {
        const canvas = await captureViewCanvas();
        const { jsPDF } = window.jspdf;
        const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
        const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
        addCanvasAsPage(pdf, canvas, true, `${el('periodTitle').textContent} · ${parentViewLabel()}`);
        pdf.save(`kidscheduler-${viewSlug()}-${slugSelection()}.pdf`);
      }
    } catch (e) { alert('PDF export failed: ' + e.message); }
    finally { btn.disabled = false; }
  }

  // ---------------- Theme ----------------

  function currentEffectiveTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { /* ignore */ }
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function updateThemeToggleIcon() {
    const btn = el('themeToggle');
    if (!btn) return;
    const dark = currentEffectiveTheme() === 'dark';
    btn.textContent = dark ? '☀️' : '\u{1F319}';
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { /* ignore */ }
    if (stored === 'light' || stored === 'dark') document.documentElement.setAttribute('data-theme', stored);
    updateThemeToggleIcon();
    const btn = el('themeToggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const next = currentEffectiveTheme() === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (e) { /* ignore */ }
        document.documentElement.setAttribute('data-theme', next);
        updateThemeToggleIcon();
        applyAppearanceSettings();
      });
    }
  }

  // ---------------- Wiring ----------------

  function wireEvents() {
    el('prevBtn').addEventListener('click', goPrev);
    el('nextBtn').addEventListener('click', goNext);
    el('todayBtn').addEventListener('click', goToday);

    document.querySelectorAll('#viewSwitch button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

    el('sidebarToggle').addEventListener('click', () => {
      el('sidebar').classList.add('open');
      el('sidebarBackdrop').classList.remove('hidden');
    });
    el('sidebarBackdrop').addEventListener('click', () => {
      el('sidebar').classList.remove('open');
      el('sidebarBackdrop').classList.add('hidden');
    });

    el('selectAllBtn').addEventListener('click', selectAll);
    el('clearAllBtn').addEventListener('click', clearAll);
    el('parentViewToggle').querySelector('.dad').addEventListener('click', () => setOtherParentView(false));
    el('parentViewToggle').querySelector('.mom').addEventListener('click', () => setOtherParentView(true));

    el('yearMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); el('yearDropdown').classList.toggle('hidden'); });
    el('exportBtn').addEventListener('click', (e) => { e.stopPropagation(); el('exportDropdown').classList.toggle('hidden'); });
    document.addEventListener('click', () => { el('exportDropdown').classList.add('hidden'); el('yearDropdown').classList.add('hidden'); });
    el('exportDropdown').addEventListener('click', (e) => e.stopPropagation());
    el('yearDropdown').addEventListener('click', (e) => e.stopPropagation());
    el('exportDropdown').querySelectorAll('button[data-export]').forEach((btn) => {
      btn.addEventListener('click', () => {
        el('exportDropdown').classList.add('hidden');
        const kind = btn.dataset.export;
        if (kind === 'ics') exportICS();
        else if (kind === 'pdf') exportPDF();
        else if (kind === 'png') exportPNG();
      });
    });

    el('modalClose').addEventListener('click', closeDayModal);
    el('modalCancel').addEventListener('click', closeDayModal);
    el('modalSave').addEventListener('click', saveDayModal);
    el('dayModal').addEventListener('click', (e) => { if (e.target.id === 'dayModal') closeDayModal(); });
  }

  // ---------------- Render dispatch ----------------

  function renderAll() {
    renderTopbar();
    renderSidebar();
    el('monthView').classList.toggle('hidden', view !== 'month');
    el('weekView').classList.toggle('hidden', view !== 'week');
    el('yearView').classList.toggle('hidden', view !== 'year');
    if (view === 'month') renderMonthView();
    else if (view === 'week') renderWeekView();
    else renderYearView();
  }

  // ---------------- Init ----------------

  async function init() {
    try {
      await loadSchedule();
    } catch (e) {
      document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Could not reach the Kid Scheduler server. Is it running?</p>';
      return;
    }

    selectedKids = loadSelection();
    try { showOtherParent = localStorage.getItem(OTHER_PARENT_STORAGE_KEY) === '1'; } catch (e) { /* ignore */ }
    updateParentViewToggle();
    focusDate = new Date();
    syncSchoolYearToFocus();
    if (!currentSchoolYearId) {
      const years = sortedSchoolYears();
      if (years.length) currentSchoolYearId = years[0].id;
    }

    renderWeekdayRow();
    wireEvents();
    initTheme();
    renderAll();
  }

  init();
})();
