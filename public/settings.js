(() => {
  'use strict';

  let schedule = null;
  const el = (id) => document.getElementById(id);

  async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }
  async function apiPost(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Request failed (${res.status})`); }
    return res.json();
  }
  async function apiPut(url, body) {
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Request failed (${res.status})`); }
    return res.json();
  }
  async function apiDelete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Request failed (${res.status})`); }
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  async function reload() {
    schedule = await apiGet('/api/schedule');
    renderKids();
    renderGroups();
    renderPeople();
    renderYears();
    renderHolidays();
    renderBreaks();
    renderAppointments();
    populateKidSelects();
  }

  function populateKidSelects() {
    const kidOptions = schedule.kids.filter((k) => k.active !== false)
      .map((k) => `<option value="${k.id}">${k.name}</option>`).join('');
    el('addKidForm').elements.group.innerHTML = '<option value="">(no group)</option>' +
      schedule.groups.map((g) => `<option value="${g.id}">${g.label}</option>`).join('');
    el('addApptForm').elements.kidId.innerHTML = kidOptions;
    el('importKidId').innerHTML = kidOptions;
  }

  // ---------------- Kids ----------------

  function renderKids() {
    const tbody = document.querySelector('#kidsTable tbody');
    tbody.innerHTML = '';
    for (const kid of schedule.kids) {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = kid.name;
      nameInput.addEventListener('change', () => saveKid(kid.id, { name: nameInput.value }));
      nameTd.appendChild(nameInput);

      const groupTd = document.createElement('td');
      const groupSelect = document.createElement('select');
      groupSelect.innerHTML = '<option value="">(no group)</option>' +
        schedule.groups.map((g) => `<option value="${g.id}" ${g.id === kid.group ? 'selected' : ''}>${g.label}</option>`).join('');
      groupSelect.addEventListener('change', () => saveKid(kid.id, { group: groupSelect.value || null }));
      groupTd.appendChild(groupSelect);

      const colorTd = document.createElement('td');
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = kid.color;
      colorInput.addEventListener('change', () => saveKid(kid.id, { color: colorInput.value }));
      colorTd.appendChild(colorInput);

      const bdayTd = document.createElement('td');
      const bdayInput = document.createElement('input');
      bdayInput.type = 'text';
      bdayInput.placeholder = 'MM-DD';
      bdayInput.pattern = '\\d{2}-\\d{2}';
      bdayInput.value = kid.birthday || '';
      bdayInput.addEventListener('change', () => {
        if (bdayInput.value && !/^\d{2}-\d{2}$/.test(bdayInput.value)) { alert('Birthday must be MM-DD'); return; }
        saveKid(kid.id, { birthday: bdayInput.value || null });
      });
      bdayTd.appendChild(bdayInput);

      const classTd = document.createElement('td');
      const classInput = document.createElement('input');
      classInput.type = 'text';
      classInput.placeholder = 'e.g. 1A';
      classInput.style.width = '80px';
      classInput.value = kid.schoolClass || '';
      classInput.addEventListener('change', () => saveKid(kid.id, { schoolClass: classInput.value.trim() || null }));
      classTd.appendChild(classInput);

      const activeTd = document.createElement('td');
      const activeInput = document.createElement('input');
      activeInput.type = 'checkbox';
      activeInput.checked = kid.active !== false;
      activeInput.addEventListener('change', () => saveKid(kid.id, { active: activeInput.checked }));
      activeTd.appendChild(activeInput);

      tr.append(nameTd, groupTd, colorTd, bdayTd, classTd, activeTd);
      tbody.appendChild(tr);
    }
  }

  async function saveKid(id, patch) {
    try {
      const updated = await apiPut(`/api/kids/${id}`, patch);
      Object.assign(schedule.kids.find((k) => k.id === id), updated);
      populateKidSelects();
      if (pendingImportRows.length) reclassifyPendingRows();
    } catch (e) { alert(e.message); }
  }

  el('addKidForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await apiPost('/api/kids', {
        name: f.name.value.trim(),
        group: f.group.value || null,
        color: f.color.value,
        birthday: f.birthday.value || null,
        schoolClass: f.schoolClass.value.trim() || null,
      });
      f.reset();
      await reload();
    } catch (err) { alert(err.message); }
  });

  // ---------------- Groups ----------------

  function renderGroups() {
    const tbody = document.querySelector('#groupsTable tbody');
    tbody.innerHTML = '';
    for (const group of schedule.groups) {
      const tr = document.createElement('tr');
      const labelTd = document.createElement('td');
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.value = group.label;
      labelInput.addEventListener('change', () => saveGroup(group.id, { label: labelInput.value }));
      labelTd.appendChild(labelInput);

      const otherTd = document.createElement('td');
      const otherInput = document.createElement('input');
      otherInput.type = 'text';
      otherInput.value = group.otherParentLabel || '';
      otherInput.addEventListener('change', () => saveGroup(group.id, { otherParentLabel: otherInput.value }));
      otherTd.appendChild(otherInput);

      tr.append(labelTd, otherTd);
      tbody.appendChild(tr);
    }
  }

  async function saveGroup(id, patch) {
    try {
      const updated = await apiPut(`/api/groups/${id}`, patch);
      Object.assign(schedule.groups.find((g) => g.id === id), updated);
      populateKidSelects();
      renderKids();
    } catch (e) { alert(e.message); }
  }

  el('addGroupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await apiPost('/api/groups', { label: f.label.value.trim(), otherParentLabel: f.otherParentLabel.value.trim() || 'the other parent' });
      f.reset();
      await reload();
    } catch (err) { alert(err.message); }
  });

  // ---------------- People ----------------

  function renderPeople() {
    const tbody = document.querySelector('#peopleTable tbody');
    tbody.innerHTML = '';
    for (const person of schedule.people) {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = person.name;
      nameInput.addEventListener('change', () => savePerson(person.id, { name: nameInput.value }));
      nameTd.appendChild(nameInput);

      const bdayTd = document.createElement('td');
      const bdayInput = document.createElement('input');
      bdayInput.type = 'text';
      bdayInput.value = person.birthday || '';
      bdayInput.pattern = '\\d{2}-\\d{2}';
      bdayInput.addEventListener('change', () => {
        if (!/^\d{2}-\d{2}$/.test(bdayInput.value)) { alert('Birthday must be MM-DD'); return; }
        savePerson(person.id, { birthday: bdayInput.value });
      });
      bdayTd.appendChild(bdayInput);

      const noteTd = document.createElement('td');
      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.value = person.note || '';
      noteInput.addEventListener('change', () => savePerson(person.id, { note: noteInput.value || null }));
      noteTd.appendChild(noteInput);

      const activeTd = document.createElement('td');
      const activeInput = document.createElement('input');
      activeInput.type = 'checkbox';
      activeInput.checked = person.active !== false;
      activeInput.addEventListener('change', () => savePerson(person.id, { active: activeInput.checked }));
      activeTd.appendChild(activeInput);

      tr.append(nameTd, bdayTd, noteTd, activeTd);
      tbody.appendChild(tr);
    }
  }

  async function savePerson(id, patch) {
    try {
      const updated = await apiPut(`/api/people/${id}`, patch);
      Object.assign(schedule.people.find((p) => p.id === id), updated);
    } catch (e) { alert(e.message); }
  }

  el('addPersonForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await apiPost('/api/people', { name: f.name.value.trim(), birthday: f.birthday.value.trim(), note: f.note.value.trim() || null });
      f.reset();
      await reload();
    } catch (err) { alert(err.message); }
  });

  // ---------------- School years ----------------

  function renderYears() {
    const tbody = document.querySelector('#yearsTable tbody');
    tbody.innerHTML = '';
    for (const year of [...schedule.schoolYears].sort((a, b) => a.start.localeCompare(b.start))) {
      const tr = document.createElement('tr');

      const labelTd = document.createElement('td');
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.value = year.label;
      labelInput.addEventListener('change', () => saveYear(year.id, { label: labelInput.value }));
      labelTd.appendChild(labelInput);

      const startTd = document.createElement('td');
      const startInput = document.createElement('input');
      startInput.type = 'date';
      startInput.value = year.start;
      startInput.addEventListener('change', () => saveYear(year.id, { start: startInput.value }));
      startTd.appendChild(startInput);

      const endTd = document.createElement('td');
      const endInput = document.createElement('input');
      endInput.type = 'date';
      endInput.value = year.end;
      endInput.addEventListener('change', () => saveYear(year.id, { end: endInput.value }));
      endTd.appendChild(endInput);

      const lockTd = document.createElement('td');
      const lockSelect = document.createElement('select');
      lockSelect.innerHTML = `
        <option value="auto" ${year.lockOverride === null ? 'selected' : ''}>Auto</option>
        <option value="true" ${year.lockOverride === true ? 'selected' : ''}>Force locked</option>
        <option value="false" ${year.lockOverride === false ? 'selected' : ''}>Force unlocked</option>
      `;
      lockSelect.addEventListener('change', () => {
        const v = lockSelect.value;
        saveYear(year.id, { lockOverride: v === 'auto' ? null : v === 'true' });
      });
      lockTd.appendChild(lockSelect);

      const currentlyTd = document.createElement('td');
      currentlyTd.textContent = year.locked ? '\u{1F512} locked' : 'editable';

      tr.append(labelTd, startTd, endTd, lockTd, currentlyTd);
      tbody.appendChild(tr);
    }
  }

  async function saveYear(id, patch) {
    // A lockOverride change can affect other years' *computed* lock state too
    // (the auto-lock rule looks at whether a later year exists), so refetch
    // everything rather than patching just this row in place.
    try {
      await apiPut(`/api/school-years/${id}`, patch);
      await reload();
    } catch (e) { alert(e.message); }
  }

  el('addYearForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await apiPost('/api/school-years', { label: f.label.value.trim(), start: f.start.value, end: f.end.value });
      f.reset();
      await reload();
    } catch (err) { alert(err.message); }
  });

  // ---------------- Holidays ----------------

  function renderHolidays() {
    const tbody = document.querySelector('#holidaysTable tbody');
    tbody.innerHTML = '';
    for (const h of [...schedule.holidays].sort((a, b) => a.date.localeCompare(b.date))) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${h.date}</td><td>${h.label}</td><td>${h.source}</td>`;
      const actionTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn-sm';
      delBtn.textContent = '×';
      delBtn.title = 'Remove';
      delBtn.addEventListener('click', async () => {
        try { await apiDelete(`/api/holidays/${h.id}`); await reload(); } catch (err) { alert(err.message); }
      });
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    }
  }

  el('addHolidayForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await apiPost('/api/holidays', { date: f.date.value, label: f.label.value.trim() });
      f.reset();
      await reload();
    } catch (err) { alert(err.message); }
  });

  el('syncHolidaysBtn').addEventListener('click', async () => {
    const year = Number(el('syncYear').value) || new Date().getFullYear();
    const statusEl = el('syncStatus');
    statusEl.textContent = 'Syncing…';
    try {
      const result = await apiPost('/api/holidays/sync', { year });
      statusEl.textContent = `Synced ${result.imported} holidays for ${year}.`;
      await reload();
    } catch (err) {
      statusEl.textContent = `Failed: ${err.message}`;
    }
  });

  // ---------------- School breaks ----------------

  function renderBreaks() {
    const tbody = document.querySelector('#breaksTable tbody');
    tbody.innerHTML = '';
    for (const b of [...schedule.schoolBreaks].sort((a, b2) => a.start.localeCompare(b2.start))) {
      const tr = document.createElement('tr');

      const labelTd = document.createElement('td');
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.value = b.label;
      labelInput.addEventListener('change', () => saveBreak(b.id, { label: labelInput.value }));
      labelTd.appendChild(labelInput);

      const startTd = document.createElement('td');
      const startInput = document.createElement('input');
      startInput.type = 'date';
      startInput.value = b.start;
      startInput.addEventListener('change', () => saveBreak(b.id, { start: startInput.value }));
      startTd.appendChild(startInput);

      const endTd = document.createElement('td');
      const endInput = document.createElement('input');
      endInput.type = 'date';
      endInput.value = b.end;
      endInput.addEventListener('change', () => saveBreak(b.id, { end: endInput.value }));
      endTd.appendChild(endInput);

      const actionTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn-sm';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async () => {
        try { await apiDelete(`/api/school-breaks/${b.id}`); await reload(); } catch (err) { alert(err.message); }
      });
      actionTd.appendChild(delBtn);

      tr.append(labelTd, startTd, endTd, actionTd);
      tbody.appendChild(tr);
    }
  }

  async function saveBreak(id, patch) {
    try {
      const updated = await apiPut(`/api/school-breaks/${id}`, patch);
      Object.assign(schedule.schoolBreaks.find((b) => b.id === id), updated);
    } catch (e) { alert(e.message); }
  }

  el('addBreakForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await apiPost('/api/school-breaks', { label: f.label.value.trim(), start: f.start.value, end: f.end.value });
      f.reset();
      await reload();
    } catch (err) { alert(err.message); }
  });

  // ---------------- Appointments ----------------

  function renderAppointments() {
    const tbody = document.querySelector('#appointmentsTable tbody');
    tbody.innerHTML = '';
    for (const a of [...schedule.appointments].sort((x, y) => x.date.localeCompare(y.date))) {
      const kid = schedule.kids.find((k) => k.id === a.kidId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${kid ? kid.name : a.kidId}</td><td>${a.date}</td><td>${a.title}</td><td>${a.notes || ''}</td><td>${a.source}</td>`;
      const actionTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn-sm';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', async () => {
        try { await apiDelete(`/api/appointments/${a.id}`); await reload(); } catch (err) { alert(err.message); }
      });
      actionTd.appendChild(delBtn);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    }
  }

  el('addApptForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await apiPost('/api/appointments', {
        kidId: f.kidId.value,
        date: f.date.value,
        title: f.title.value.trim(),
        notes: f.notes.value.trim() || null,
      });
      f.reset();
      await reload();
    } catch (err) { alert(err.message); }
  });

  // ---------------- Bulk import (CSV or OCR'd PDF -> shared preview) ----------------

  function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { result.push(cur); cur = ''; }
      else cur += c;
    }
    result.push(cur);
    return result;
  }

  function parseCSV(text) {
    const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length);
    if (!lines.length) return [];
    const header = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    const dateIdx = header.indexOf('date');
    const titleIdx = header.indexOf('title');
    const notesIdx = header.indexOf('notes');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      rows.push({
        rawDate: dateIdx >= 0 ? (cols[dateIdx] || '').trim() : '',
        title: titleIdx >= 0 ? (cols[titleIdx] || '').trim() : '',
        notes: notesIdx >= 0 ? (cols[notesIdx] || '').trim() : '',
      });
    }
    return rows;
  }

  function parseFlexibleDate(raw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    let m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    return null;
  }

  function addDaysISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  const WEEKDAY_WORD_RE = '(?:Mo|Di|Mi|Do|Fr|Sa|So)(?:ntag|enstag|ttwoch|nnerstag|eitag|mstag|nntag)?';

  // Turns OCR'd (or otherwise messy) free text from a school notice into
  // {rawDate, title, notes} rows using the shape of the one real example
  // we've seen: "<Title> <Wd,> DD.MM.YYYY [bis <Wd,> DD.MM.YYYY] [time/notes]"
  // - sometimes wrapped so a continuation line has no title of its own, and
  // a "jeden <Wochentag>" (every <weekday>) range gets expanded into one row
  // per occurrence rather than a single unusable date range.
  function parseScheduleText(text) {
    const dateRe = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g;
    const weekdayPrefixRe = new RegExp(`(^|\\s)${WEEKDAY_WORD_RE}[.,]?\\s*$`, 'i');
    const lines = text.split(/\r\n|\n|\r/).map((l) => l.trim()).filter(Boolean);

    const rows = [];
    let lastTitle = '';
    for (const line of lines) {
      const dates = [...line.matchAll(dateRe)];
      if (!dates.length) continue;

      const first = dates[0];
      let title = line.slice(0, first.index).replace(weekdayPrefixRe, '').trim();
      title = title.replace(/[-–—,]\s*$/, '').trim();
      if (title) lastTitle = title;
      else title = lastTitle || '(untitled)';

      const last = dates[dates.length - 1];
      let trailing = line.slice(last.index + last[0].length).trim();
      const startISO = `${first[3]}-${pad2(first[2])}-${pad2(first[1])}`;

      if (dates.length > 1) {
        const endISO = `${last[3]}-${pad2(last[2])}-${pad2(last[1])}`;
        const weeklyMatch = line.match(new RegExp(`jeden\\s+(${WEEKDAY_WORD_RE}\\w*)`, 'i'));
        if (weeklyMatch) {
          const note = trailing.replace(new RegExp(`^.*?jeden\\s+${WEEKDAY_WORD_RE}\\w*`, 'i'), '').trim() || null;
          for (let cur = startISO; cur <= endISO; cur = addDaysISO(cur, 7)) {
            rows.push({ rawDate: cur, title, notes: note });
          }
          continue;
        }
        rows.push({ rawDate: startISO, title, notes: trailing || `bis ${last[0]}` });
        continue;
      }

      rows.push({ rawDate: startISO, title, notes: trailing || null });
    }
    return rows;
  }

  let pendingImportRows = [];

  // School notices (a class newsletter, a whole-school events list) usually
  // cover every class, but some rows are specific to one - either a specific
  // class code ("Schwimmunterricht 3A") or a grade-level phrase ("für die
  // 3.+ 4.Klassen", "Verabschiedung der 4. Klassen") without ever naming a
  // letter. "alle Klassen" overrides both, since that phrasing explicitly
  // means "everyone" - but a bare "alle" (e.g. "MSK alle") only means "every
  // MSK group", not "every class", so it does NOT override a grade
  // restriction stated elsewhere in the same line.
  // Austrian primary schools run grades 1-4, with a handful of parallel
  // classes per grade (1A, 1B, ...) depending on school size - rarely more
  // than a few, but A-F gives some headroom over the common A-D range.
  const CLASS_TOKEN_RE = /\b([1-4][A-F]|MSK)\b/g;
  const GRADE_PHRASE_RE = /((?:[1-4]\.\s*(?:[+,]|und)?\s*)+)Klassen?\b/gi;
  const ALL_CLASSES_RE = /\balle\s+Klassen\b/i;

  function kidGradeNumber(schoolClass) {
    const m = schoolClass && schoolClass.match(/^([1-4])/);
    return m ? Number(m[1]) : null;
  }

  function classifyRow(title, notes, targetClass) {
    const haystack = `${title} ${notes || ''}`;
    if (ALL_CLASSES_RE.test(haystack)) return { classLabel: null, classMismatch: false };

    const gradeMatches = [...haystack.matchAll(GRADE_PHRASE_RE)];
    if (gradeMatches.length) {
      const grades = [...new Set(gradeMatches.flatMap((m) => [...m[1].matchAll(/[1-4]/g)].map((d) => Number(d[0]))))].sort();
      const targetGrade = kidGradeNumber(targetClass);
      return {
        classLabel: `grade ${grades.join('+')}`,
        classMismatch: !!targetGrade && !grades.includes(targetGrade),
      };
    }

    const tokens = [...new Set([...haystack.matchAll(CLASS_TOKEN_RE)].map((m) => m[1]))];
    if (!tokens.length) return { classLabel: null, classMismatch: false };
    return {
      classLabel: `class ${tokens.join('+')}`,
      classMismatch: !!targetClass && !tokens.includes(targetClass),
    };
  }

  function targetKid() {
    return schedule.kids.find((k) => k.id === el('importKidId').value);
  }

  function toPendingRows(rawRows) {
    const thisYear = new Date().getFullYear();
    const kid = targetKid();
    return rawRows.map((r) => {
      const iso = parseFlexibleDate(r.rawDate);
      let error = null;
      if (!iso) error = `Unrecognized date: "${r.rawDate}"`;
      else if (Number(iso.slice(0, 4)) < thisYear - 2 || Number(iso.slice(0, 4)) > thisYear + 10) {
        error = `Implausible year - likely an OCR misread: "${r.rawDate}"`;
      } else if (!r.title) error = 'Missing title';
      const { classLabel, classMismatch } = classifyRow(r.title || '', r.notes || '', kid && kid.schoolClass);
      return { rawDate: r.rawDate, title: r.title || '', notes: r.notes || '', iso, error, classLabel, classMismatch, selected: !classMismatch };
    });
  }

  // Re-runs class classification in place (keeping edits, error state, and
  // any row a person has manually re-checked/unchecked) when the target kid
  // or that kid's class changes after rows are already on screen.
  function reclassifyPendingRows() {
    const kid = targetKid();
    for (const r of pendingImportRows) {
      const wasDefaultSelection = r.selected === !r.classMismatch;
      const { classLabel, classMismatch } = classifyRow(r.title, r.notes, kid && kid.schoolClass);
      r.classLabel = classLabel;
      r.classMismatch = classMismatch;
      if (wasDefaultSelection) r.selected = !classMismatch;
    }
    renderImportPreview();
  }

  el('importKidId').addEventListener('change', () => { if (pendingImportRows.length) reclassifyPendingRows(); });

  el('importFile').addEventListener('change', async () => {
    const file = el('importFile').files[0];
    if (!file) return;
    const text = await file.text();
    const rawRows = parseCSV(text);
    if (!rawRows.length) {
      el('importPreview').innerHTML = '<p class="settings-hint">No rows found. Make sure the file has a header row with date, title, notes columns.</p>';
      return;
    }
    pendingImportRows = toPendingRows(rawRows);
    renderImportPreview();
  });

  el('ocrExtractBtn').addEventListener('click', async () => {
    const file = el('importPdfFile').files[0];
    const status = el('ocrStatus');
    if (!file) { status.textContent = 'Choose a PDF file first.'; return; }
    const page = Number(el('importPdfPage').value) || 1;

    status.textContent = 'Rendering + running OCR… this can take a little while.';
    el('ocrExtractBtn').disabled = true;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('page', String(page));
      const res = await fetch('/api/appointments/ocr-pdf', { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `OCR failed (${res.status})`);

      status.textContent = `Extracted text from page ${result.page}.`;
      el('ocrRawText').value = result.text;
      el('ocrRawDetails').classList.remove('hidden');
      pendingImportRows = toPendingRows(parseScheduleText(result.text));
      renderImportPreview();
    } catch (err) {
      status.textContent = `Failed: ${err.message}`;
    } finally {
      el('ocrExtractBtn').disabled = false;
    }
  });

  el('ocrReparseBtn').addEventListener('click', () => {
    pendingImportRows = toPendingRows(parseScheduleText(el('ocrRawText').value));
    renderImportPreview();
  });

  function renderImportPreview() {
    const preview = el('importPreview');
    if (!pendingImportRows.length) { preview.innerHTML = ''; return; }

    const kid = targetKid();
    const importCount = pendingImportRows.filter((r) => !r.error && r.selected).length;
    const mismatchCount = pendingImportRows.filter((r) => r.classMismatch).length;
    const rowsHtml = pendingImportRows.map((r, i) => `
      <tr class="${r.error ? 'row-error' : ''}" data-row="${i}">
        <td><input type="checkbox" class="pi-selected" ${r.selected ? 'checked' : ''} ${r.error ? 'disabled' : ''}></td>
        <td><input type="text" class="pi-date" value="${escapeAttr(r.rawDate)}" size="12">${r.error ? `<div class="row-error-msg">${escapeHtml(r.error)}</div>` : ''}</td>
        <td>
          <input type="text" class="pi-title" value="${escapeAttr(r.title)}">
          ${r.classLabel ? `<div class="row-error-msg" style="color:${r.classMismatch ? 'var(--today-ring)' : 'var(--text-muted)'}">${escapeHtml(r.classLabel)}${r.classMismatch && kid && kid.schoolClass ? ` ≠ ${escapeHtml(kid.schoolClass)}` : ''}</div>` : ''}
        </td>
        <td><input type="text" class="pi-notes" value="${escapeAttr(r.notes)}"></td>
        <td><button type="button" class="icon-btn-sm pi-remove" title="Remove row">×</button></td>
      </tr>
    `).join('');
    preview.innerHTML = `
      ${mismatchCount ? `<p class="settings-hint">${mismatchCount} row${mismatchCount === 1 ? '' : 's'} mention a different class than ${kid ? kid.name + "'s (" + (kid.schoolClass || 'no class set') + ')' : 'the target kid\'s'} and are unchecked by default.</p>` : ''}
      <table class="import-preview-table">
        <thead><tr><th></th><th>Date</th><th>Title</th><th>Notes</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <button id="confirmImportBtn" class="btn small primary">Import ${importCount} checked row${importCount === 1 ? '' : 's'}</button>
      <button id="clearImportBtn" class="btn small">Clear preview</button>
      <span id="importResultMsg" class="settings-hint"></span>
    `;

    preview.querySelectorAll('tr[data-row]').forEach((tr) => {
      const i = Number(tr.dataset.row);
      const revalidate = () => {
        const r = pendingImportRows[i];
        r.rawDate = tr.querySelector('.pi-date').value.trim();
        r.title = tr.querySelector('.pi-title').value.trim();
        r.notes = tr.querySelector('.pi-notes').value.trim();
        r.iso = parseFlexibleDate(r.rawDate);
        r.error = !r.iso ? `Unrecognized date: "${r.rawDate}"` : (!r.title ? 'Missing title' : null);
        const k = targetKid();
        Object.assign(r, classifyRow(r.title, r.notes, k && k.schoolClass));
        renderImportPreview();
      };
      tr.querySelector('.pi-date').addEventListener('change', revalidate);
      tr.querySelector('.pi-title').addEventListener('change', revalidate);
      tr.querySelector('.pi-notes').addEventListener('change', revalidate);
      tr.querySelector('.pi-selected').addEventListener('change', (e) => {
        pendingImportRows[i].selected = e.target.checked;
      });
      tr.querySelector('.pi-remove').addEventListener('click', () => {
        pendingImportRows.splice(i, 1);
        renderImportPreview();
      });
    });

    el('confirmImportBtn').addEventListener('click', confirmImport);
    el('clearImportBtn').addEventListener('click', () => { pendingImportRows = []; renderImportPreview(); });
  }

  function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  async function confirmImport() {
    const kidId = el('importKidId').value;
    const rows = pendingImportRows.filter((r) => !r.error && r.selected).map((r) => ({ kidId, date: r.iso, title: r.title, notes: r.notes || null }));
    if (!rows.length) return;
    try {
      const result = await apiPost('/api/appointments/import', { rows });
      pendingImportRows = [];
      renderImportPreview();
      el('importFile').value = '';
      el('importPdfFile').value = '';
      el('ocrRawDetails').classList.add('hidden');
      await reload();
      // reload() re-renders other sections but leaves #importPreview alone
      // (already cleared above), so surface the result as a one-off toast.
      const msg = document.createElement('p');
      msg.className = 'settings-hint';
      msg.textContent = `Imported ${result.importedCount} of ${rows.length}.`;
      el('importPreview').after(msg);
      setTimeout(() => msg.remove(), 6000);
    } catch (err) {
      el('importResultMsg').textContent = `Failed: ${err.message}`;
    }
  }

  reload().catch((e) => {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Could not reach the Kid Scheduler server.</p>';
  });
})();
