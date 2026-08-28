(() => {
  'use strict';

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const STATUS_LABELS = { away: 'Away', 'with-us': 'With us', uncertain: 'Uncertain' };
  const STATUS_ORDER = ['away', 'with-us', 'uncertain'];
  const STORAGE_KEY = 'kidscheduler.selectedKids';

  let schedule = null;
  let selectedKids = new Set();
  let currentYear, currentMonth; // currentMonth: 0-11
  let modalDate = null;
  let modalDraft = null; // { kids: {id: status}, notes }

  const el = (id) => document.getElementById(id);

  // ---------------- Data loading ----------------

  async function loadSchedule() {
    const res = await fetch('/api/schedule');
    if (!res.ok) throw new Error('Failed to load schedule');
    schedule = await res.json();
  }

  async function saveDay(iso, patch) {
    const res = await fetch(`/api/days/${iso}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Failed to save day');
    return res.json();
  }

  async function saveKid(kidId, patch) {
    const res = await fetch(`/api/kids/${kidId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Failed to save kid');
    return res.json();
  }

  // ---------------- Selection state ----------------

  function loadSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids = JSON.parse(raw).filter((id) => schedule.kids.some((k) => k.id === id));
        if (ids.length) return new Set(ids);
      }
    } catch (e) { /* fall through to default */ }
    return new Set(schedule.kids.map((k) => k.id));
  }

  function persistSelection() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedKids]));
  }

  // ---------------- Date helpers ----------------

  function pad2(n) { return String(n).padStart(2, '0'); }
  function toISO(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
  function isoToday() {
    const t = new Date();
    return toISO(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function clampToScheduleMonth(year, month) {
    const startYM = schedule.meta.start.slice(0, 7); // 'YYYY-MM'
    const endYM = schedule.meta.end.slice(0, 7);
    const ym = `${year}-${pad2(month + 1)}`;
    if (ym < startYM) return [Number(startYM.slice(0, 4)), Number(startYM.slice(5, 7)) - 1];
    if (ym > endYM) return [Number(endYM.slice(0, 4)), Number(endYM.slice(5, 7)) - 1];
    return [year, month];
  }

  // Monday-first 6x7 grid of {y, m, d, iso, inMonth}
  function buildMonthGrid(year, month) {
    const firstOfMonth = new Date(year, month, 1);
    const jsWeekday = firstOfMonth.getDay(); // 0=Sun..6=Sat
    const mondayOffset = (jsWeekday + 6) % 7; // days to subtract to reach Monday
    const gridStart = new Date(year, month, 1 - mondayOffset);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      cells.push({
        iso: toISO(d.getFullYear(), d.getMonth(), d.getDate()),
        day: d.getDate(),
        inMonth: d.getMonth() === month,
      });
    }
    return cells;
  }

  // ---------------- Rendering: sidebar ----------------

  function kidById(id) { return schedule.kids.find((k) => k.id === id); }

  function renderSidebar() {
    const container = el('kidGroups');
    container.innerHTML = '';

    for (const group of schedule.groups) {
      const kids = schedule.kids.filter((k) => k.group === group.id);
      const groupEl = document.createElement('div');
      groupEl.className = 'kid-group';
      groupEl.dataset.group = group.id;

      const groupRow = document.createElement('label');
      groupRow.className = 'group-row';
      const groupCheckbox = document.createElement('input');
      groupCheckbox.type = 'checkbox';
      groupCheckbox.className = 'group-checkbox';
      groupRow.appendChild(groupCheckbox);
      groupRow.appendChild(Object.assign(document.createElement('span'), { textContent: group.label }));
      groupEl.appendChild(groupRow);

      groupCheckbox.addEventListener('change', () => {
        for (const kid of kids) {
          if (groupCheckbox.checked) selectedKids.add(kid.id);
          else selectedKids.delete(kid.id);
        }
        persistSelection();
        renderSidebar();
        renderCalendar();
      });

      for (const kid of kids) {
        const row = document.createElement('div');
        row.className = 'kid-row';
        row.dataset.kid = kid.id;

        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'kid-checkbox';
        cb.checked = selectedKids.has(kid.id);
        cb.addEventListener('change', () => {
          if (cb.checked) selectedKids.add(kid.id);
          else selectedKids.delete(kid.id);
          persistSelection();
          renderSidebar();
          renderCalendar();
        });

        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = kid.color;

        const name = document.createElement('span');
        name.className = 'kid-name';
        name.textContent = kid.name;

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
          renderCalendar();
          try {
            await saveKid(kid.id, { color: kid.color });
          } catch (e) {
            alert('Could not save color to server.');
          }
        });

        const count = document.createElement('span');
        count.className = 'kid-count';
        count.textContent = countKidDaysInMonth(kid.id);

        row.appendChild(label);
        row.appendChild(colorInput);
        row.appendChild(count);
        groupEl.appendChild(row);
      }

      const states = kids.map((k) => selectedKids.has(k.id));
      groupCheckbox.checked = states.every(Boolean);
      groupCheckbox.indeterminate = states.some(Boolean) && !states.every(Boolean);

      container.appendChild(groupEl);
    }
  }

  function countKidDaysInMonth(kidId) {
    let n = 0;
    for (const [iso, day] of Object.entries(schedule.days)) {
      if (Number(iso.slice(0, 4)) === currentYear && Number(iso.slice(5, 7)) - 1 === currentMonth) {
        if (day.kids && day.kids[kidId]) n++;
      }
    }
    return n;
  }

  // ---------------- Rendering: calendar ----------------

  function renderWeekdayRow() {
    const row = el('weekdayRow');
    row.innerHTML = '';
    for (const w of WEEKDAYS) {
      row.appendChild(Object.assign(document.createElement('div'), { textContent: w }));
    }
  }

  function renderCalendar() {
    el('monthTitle').textContent = new Date(currentYear, currentMonth, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const grid = el('calendarGrid');
    grid.innerHTML = '';
    const cells = buildMonthGrid(currentYear, currentMonth);
    const today = isoToday();
    const dadKidsFirst = schedule.kids; // already dad group then mom group in seed order

    for (const cell of cells) {
      const dayData = schedule.days[cell.iso];
      const cellEl = document.createElement('div');
      cellEl.className = 'day-cell';
      if (!cell.inMonth) cellEl.classList.add('other-month');
      if (cell.iso === today) cellEl.classList.add('today');
      if (dayData && dayData.holiday) cellEl.classList.add('holiday');
      if (dayData && dayData.schoolBreak) cellEl.classList.add('break');
      cellEl.dataset.iso = cell.iso;

      const title = [];
      if (dayData && dayData.holiday) title.push(dayData.holiday);
      if (dayData && dayData.schoolBreak) title.push(dayData.schoolBreak);
      if (dayData && dayData.notes) title.push(dayData.notes);
      if (title.length) cellEl.title = title.join(' \u00b7 ');

      const dayNumber = document.createElement('div');
      dayNumber.className = 'day-number';
      dayNumber.textContent = cell.day;
      cellEl.appendChild(dayNumber);

      if (dayData && dayData.birthdays && dayData.birthdays.length) {
        const cake = document.createElement('div');
        cake.className = 'day-cake';
        cake.textContent = '\u{1F382}';
        cake.title = dayData.birthdays.map((b) => b.name).join(', ');
        cellEl.appendChild(cake);
      }

      const tags = document.createElement('div');
      tags.className = 'day-kid-tags';
      if (dayData && dayData.kids) {
        for (const kid of dadKidsFirst) {
          if (!selectedKids.has(kid.id)) continue;
          const status = dayData.kids[kid.id];
          if (!status) continue;
          const tag = document.createElement('div');
          tag.className = 'kid-tag' + (status === 'uncertain' ? ' uncertain' : '');
          tag.style.setProperty('--tag-color', kid.color);
          tag.style.background = kid.color;
          tag.textContent = kid.name + (status === 'uncertain' ? ' ?' : '');
          tags.appendChild(tag);
        }
      }
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

  // ---------------- Day modal ----------------

  function openDayModal(iso) {
    modalDate = iso;
    const existing = schedule.days[iso] || { kids: {}, notes: null };
    modalDraft = { kids: { ...existing.kids }, notes: existing.notes || '' };

    el('modalDate').textContent = new Date(iso + 'T00:00:00')
      .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const rows = el('modalKidRows');
    rows.innerHTML = '';
    for (const kid of schedule.kids) {
      const row = document.createElement('div');
      row.className = 'modal-kid-row';

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = kid.color;

      const name = document.createElement('span');
      name.className = 'kid-name';
      name.textContent = kid.name;

      const seg = document.createElement('div');
      seg.className = 'segmented';
      for (const status of STATUS_ORDER) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = STATUS_LABELS[status];
        const current = modalDraft.kids[kid.id] || 'away';
        if (current === status) {
          btn.classList.add('active');
          btn.style.background = kid.color;
        }
        btn.addEventListener('click', () => {
          if (status === 'away') delete modalDraft.kids[kid.id];
          else modalDraft.kids[kid.id] = status;
          refreshModalKidRow(kid, seg);
        });
        seg.appendChild(btn);
      }

      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(seg);
      rows.appendChild(row);
    }

    el('modalNotes').value = modalDraft.notes;
    el('dayModal').classList.remove('hidden');
  }

  function refreshModalKidRow(kid, segEl) {
    const current = modalDraft.kids[kid.id] || 'away';
    [...segEl.children].forEach((btn, i) => {
      const status = STATUS_ORDER[i];
      btn.classList.toggle('active', status === current);
      btn.style.background = status === current ? kid.color : '';
    });
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
    for (const kid of schedule.kids) {
      patchKids[kid.id] = modalDraft.kids[kid.id] || null;
    }
    try {
      const saved = await saveDay(modalDate, { kids: patchKids, notes });
      schedule.days[modalDate] = saved;
      closeDayModal();
      renderSidebar();
      renderCalendar();
    } catch (e) {
      alert('Could not save that day to the server.');
    }
  }

  // ---------------- Navigation ----------------

  function goToMonth(year, month) {
    while (month < 0) { month += 12; year -= 1; }
    while (month > 11) { month -= 12; year += 1; }
    [currentYear, currentMonth] = clampToScheduleMonth(year, month);
    renderSidebar();
    renderCalendar();
  }

  // ---------------- Selection actions ----------------

  function selectAll() {
    selectedKids = new Set(schedule.kids.map((k) => k.id));
    persistSelection();
    renderSidebar();
    renderCalendar();
  }

  function clearAll() {
    selectedKids = new Set();
    persistSelection();
    renderSidebar();
    renderCalendar();
  }

  function invertSelection() {
    const all = schedule.kids.map((k) => k.id);
    const next = new Set(all.filter((id) => !selectedKids.has(id)));
    selectedKids = next;
    persistSelection();
    renderSidebar();
    renderCalendar();
  }

  // ---------------- Export ----------------

  function slugSelection() {
    const names = schedule.kids.filter((k) => selectedKids.has(k.id)).map((k) => k.name);
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

  function addDaysISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return toISO(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function exportICS() {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kid Scheduler//EN',
      'CALSCALE:GREGORIAN',
    ];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const isoDates = Object.keys(schedule.days).sort();
    for (const iso of isoDates) {
      const day = schedule.days[iso];
      if (!day.kids) continue;
      for (const kid of schedule.kids) {
        if (!selectedKids.has(kid.id)) continue;
        const status = day.kids[kid.id];
        if (!status) continue;
        const dateCompact = iso.replace(/-/g, '');
        const endCompact = addDaysISO(iso, 1).replace(/-/g, '');
        lines.push(
          'BEGIN:VEVENT',
          `UID:${dateCompact}-${kid.id}@kidscheduler.local`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${dateCompact}`,
          `DTEND;VALUE=DATE:${endCompact}`,
          `SUMMARY:${icsEscape(kid.name + (status === 'uncertain' ? ' (?)' : ''))}`,
          `CATEGORIES:${icsEscape(kid.name)}`,
          'END:VEVENT'
        );
      }
    }
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    downloadBlob(blob, `kidscheduler-${slugSelection()}-${schedule.meta.schoolYear.replace('/', '-')}.ics`);
  }

  async function captureCalendarCanvas() {
    return html2canvas(el('calendar'), {
      backgroundColor: getComputedStyle(document.body).getPropertyValue('background-color') || '#ffffff',
      scale: Math.min(2, window.devicePixelRatio || 1.5),
    });
  }

  async function exportPNG() {
    const btn = el('exportBtn');
    btn.disabled = true;
    try {
      const canvas = await captureCalendarCanvas();
      canvas.toBlob((blob) => {
        downloadBlob(blob, `kidscheduler-${monthSlug()}-${slugSelection()}.png`);
      }, 'image/png');
    } catch (e) {
      alert('PNG export failed.');
    } finally {
      btn.disabled = false;
    }
  }

  async function exportPDF() {
    const btn = el('exportBtn');
    btn.disabled = true;
    try {
      const canvas = await captureCalendarCanvas();
      const { jsPDF } = window.jspdf;
      const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
      pdf.save(`kidscheduler-${monthSlug()}-${slugSelection()}.pdf`);
    } catch (e) {
      alert('PDF export failed.');
    } finally {
      btn.disabled = false;
    }
  }

  function monthSlug() {
    return new Date(currentYear, currentMonth, 1)
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      .toLowerCase()
      .replace(/\s+/g, '-');
  }

  // ---------------- Wiring ----------------

  function wireEvents() {
    el('prevBtn').addEventListener('click', () => goToMonth(currentYear, currentMonth - 1));
    el('nextBtn').addEventListener('click', () => goToMonth(currentYear, currentMonth + 1));
    el('todayBtn').addEventListener('click', () => {
      const t = new Date();
      goToMonth(t.getFullYear(), t.getMonth());
    });

    el('selectAllBtn').addEventListener('click', selectAll);
    el('clearAllBtn').addEventListener('click', clearAll);
    el('invertBtn').addEventListener('click', invertSelection);

    el('exportBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      el('exportDropdown').classList.toggle('hidden');
    });
    document.addEventListener('click', () => el('exportDropdown').classList.add('hidden'));
    el('exportDropdown').addEventListener('click', (e) => e.stopPropagation());
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
    el('dayModal').addEventListener('click', (e) => {
      if (e.target.id === 'dayModal') closeDayModal();
    });
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

    const today = new Date();
    [currentYear, currentMonth] = clampToScheduleMonth(today.getFullYear(), today.getMonth());

    renderWeekdayRow();
    wireEvents();
    renderSidebar();
    renderCalendar();
  }

  init();
})();
