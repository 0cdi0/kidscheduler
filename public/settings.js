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

      const activeTd = document.createElement('td');
      const activeInput = document.createElement('input');
      activeInput.type = 'checkbox';
      activeInput.checked = kid.active !== false;
      activeInput.addEventListener('change', () => saveKid(kid.id, { active: activeInput.checked }));
      activeTd.appendChild(activeInput);

      tr.append(nameTd, groupTd, colorTd, bdayTd, activeTd);
      tbody.appendChild(tr);
    }
  }

  async function saveKid(id, patch) {
    try {
      const updated = await apiPut(`/api/kids/${id}`, patch);
      Object.assign(schedule.kids.find((k) => k.id === id), updated);
      populateKidSelects();
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

  // ---------------- CSV import ----------------

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

  let pendingImportRows = [];

  el('importFile').addEventListener('change', async () => {
    const file = el('importFile').files[0];
    const preview = el('importPreview');
    if (!file) { preview.innerHTML = ''; return; }
    const text = await file.text();
    const rawRows = parseCSV(text);
    if (!rawRows.length) {
      preview.innerHTML = '<p class="settings-hint">No rows found. Make sure the file has a header row with date, title, notes columns.</p>';
      return;
    }

    pendingImportRows = rawRows.map((r) => {
      const iso = parseFlexibleDate(r.rawDate);
      let error = null;
      if (!iso) error = `Unrecognized date: "${r.rawDate}"`;
      else if (!r.title) error = 'Missing title';
      return { ...r, iso, error };
    });

    renderImportPreview();
  });

  function renderImportPreview() {
    const preview = el('importPreview');
    const validCount = pendingImportRows.filter((r) => !r.error).length;
    const rowsHtml = pendingImportRows.map((r) => `
      <tr class="${r.error ? 'row-error' : ''}">
        <td>${r.rawDate}${r.error ? `<div class="row-error-msg">${r.error}</div>` : ''}</td>
        <td>${r.title}</td>
        <td>${r.notes}</td>
      </tr>
    `).join('');
    preview.innerHTML = `
      <table class="import-preview-table">
        <thead><tr><th>Date</th><th>Title</th><th>Notes</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <button id="confirmImportBtn" class="btn small primary">Import ${validCount} valid row${validCount === 1 ? '' : 's'}</button>
      <span id="importResultMsg" class="settings-hint"></span>
    `;
    el('confirmImportBtn').addEventListener('click', confirmImport);
  }

  async function confirmImport() {
    const kidId = el('importKidId').value;
    const rows = pendingImportRows.filter((r) => !r.error).map((r) => ({ kidId, date: r.iso, title: r.title, notes: r.notes || null }));
    if (!rows.length) return;
    try {
      const result = await apiPost('/api/appointments/import', { rows });
      el('importResultMsg').textContent = `Imported ${result.importedCount} of ${rows.length}.`;
      pendingImportRows = [];
      el('importFile').value = '';
      await reload();
    } catch (err) {
      el('importResultMsg').textContent = `Failed: ${err.message}`;
    }
  }

  reload().catch((e) => {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Could not reach the Kid Scheduler server.</p>';
  });
})();
