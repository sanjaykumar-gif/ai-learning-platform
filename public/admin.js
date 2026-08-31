/* Organiser dashboard */
(() => {
  const $ = (s) => document.querySelector(s);
  const state = { token: localStorage.getItem('ail_admin_token') || '', status: '', search: '', timer: null, cfg: null };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(opts.raw ? {} : {}), 'x-admin-token': state.token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw new Error(data.error || 'Not authenticated'); }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const money = (p) => '₹' + (Number(p || 0) / 100).toLocaleString('en-IN');
  const dt = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function logout() {
    localStorage.removeItem('ail_admin_token');
    state.token = '';
    if (state.timer) clearInterval(state.timer);
    $('#dash-view').classList.add('hidden');
    $('#login-view').classList.remove('hidden');
    document.querySelector('header .btn').classList.remove('hidden');
  }

  function login() {
    $('#login-view').classList.add('hidden');
    $('#dash-view').classList.remove('hidden');
    document.querySelector('header .btn').classList.add('hidden');
    load();
    state.timer = setInterval(load, 20000);
  }

  /* ------------------------------------------------------------- render */
  function renderStats(s) {
    const cards = [
      { n: s.total, l: 'Registrations', hi: false },
      { n: s.paid, l: 'Paid', hi: true },
      { n: s.pending, l: 'Pending', hi: false },
      { n: money(s.revenue_paise), l: 'Revenue collected', hi: true },
      { n: s.conversion_pct + '%', l: 'Paid conversion', hi: false },
      { n: s.attended, l: 'Checked in', hi: false },
      { n: s.failed, l: 'Failed', hi: false },
      { n: s.refunded, l: 'Refunded', hi: false },
    ];
    $('#stat-cards').innerHTML = cards
      .map((c) => `<div class="card stat ${c.hi ? 'hi' : ''}"><div class="n">${c.n}</div><div class="l">${c.l}</div></div>`)
      .join('');
    $('#backend-badge').textContent = `DB: ${s.backend}`;
  }

  function renderChart(days) {
    const last = days.slice(-14);
    if (!last.length) { $('#chart').innerHTML = '<p class="muted" style="margin:0">No registrations yet — they will appear here as soon as someone signs up.</p>'; return; }
    const maxR = Math.max(...last.map((d) => d.revenue_paise), 1);
    $('#chart').innerHTML = last
      .map((d) => {
        const pct = Math.max(Math.round((d.revenue_paise / maxR) * 100), 2);
        const label = new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        return `<div style="margin-bottom:13px">
          <div style="display:flex;justify-content:space-between;font-size:13px;gap:12px;flex-wrap:wrap">
            <span style="font-weight:650">${label}</span>
            <span class="muted">${d.registrations} registered · ${d.paid} paid · ${money(d.revenue_paise)}</span>
          </div>
          <div class="bar" style="margin-top:6px"><i style="width:${pct}%"></i></div>
        </div>`;
      })
      .join('');
  }

  function renderRows(rows) {
    $('#count-line').textContent = `${rows.length} record${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) {
      $('#rows').innerHTML = '<tr><td colspan="8" class="muted center" style="padding:28px">Nothing here yet.</td></tr>';
      return;
    }
    $('#rows').innerHTML = rows
      .map((r) => `<tr data-id="${r.id}">
        <td><span class="code" style="font-size:14px">${esc(r.ticket_code)}</span>${r.notes ? `<span class="mini">${esc(r.notes)}</span>` : ''}</td>
        <td>${esc(r.name)}${r.attended ? ' <span class="stamp paid" style="font-size:10px">IN</span>' : ''}<span class="mini">${esc(r.course || '')} ${esc(r.year || '')}</span></td>
        <td>${esc(r.email)}<span class="mini">${esc(r.phone || '')}</span></td>
        <td class="muted">${esc(r.college || '—')}</td>
        <td><span class="stamp ${r.status}">${r.status}</span></td>
        <td>${money(r.amount_paise)}</td>
        <td class="muted">${dt(r.paid_at)}</td>
        <td style="white-space:nowrap">
          <a class="btn btn-ghost btn-sm" style="padding:6px 11px;font-size:12.5px" target="_blank" rel="noopener" href="https://wa.me/91${r.phone}?text=${encodeURIComponent(`Hi ${r.name}, regarding your AI Masterclass ticket ${r.ticket_code}`)}">Message</a>
          <a class="btn btn-ghost btn-sm" style="padding:6px 11px;font-size:12.5px" target="_blank" href="/ticket.html?code=${encodeURIComponent(r.ticket_code)}">Ticket</a>
          ${r.status === 'paid'
            ? `<button class="btn btn-ghost btn-sm" data-act="checkin" style="padding:6px 11px;font-size:12.5px">Check in</button>`
            : `<button class="btn btn-ghost btn-sm" data-act="markpaid" style="padding:6px 11px;font-size:12.5px">Mark paid</button>`}
        </td>
      </tr>`)
      .join('');
  }

  /* --------------------------------------------------------------- load */
  async function load() {
    try {
      const [s, list] = await Promise.all([
        api('/api/admin/stats'),
        api(`/api/admin/registrations?status=${state.status}&search=${encodeURIComponent(state.search)}&limit=500`),
      ]);
      renderStats(s);
      renderChart(s.by_day || []);
      renderRows(list.rows || []);
      $('#dash-sub').textContent = `${s.event} · last updated ${new Date().toLocaleTimeString('en-IN')}`;
    } catch (err) {
      console.error(err);
    }
  }

  /* -------------------------------------------------------------- init */
  async function init() {
    $('#yr').textContent = new Date().getFullYear();
    try { state.cfg = await (await fetch('/api/config')).json(); } catch {}

    document.querySelector('header .btn').addEventListener('click', logout);

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const box = $('#login-alert');
      box.classList.add('hidden');
      try {
        const r = await fetch('/api/admin/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: $('#pw').value }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Login failed');
        state.token = data.token;
        localStorage.setItem('ail_admin_token', data.token);
        login();
      } catch (err) {
        box.textContent = err.message; box.classList.remove('hidden');
      }
    });

    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab'); if (!b) return;
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
      b.classList.add('on');
      state.status = b.dataset.status;
      load();
    });

    let t;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.search = e.target.value.trim(); load(); }, 350);
    });

    $('#btn-refresh').addEventListener('click', load);

    $('#btn-csv').addEventListener('click', () => {
      window.location.href = `/api/admin/export.csv?status=${state.status}&search=${encodeURIComponent(state.search)}&token=${state.token}`;
    });

    $('#btn-checkin').addEventListener('click', async () => {
      const code = prompt('Enter the ticket code (AIL-XXXXXX):');
      if (!code) return;
      try {
        const r = await api('/api/admin/checkin', { body: { ticket_code: code } });
        alert(`✅ ${r.row.name} checked in.`);
        load();
      } catch (err) { alert(err.message); }
    });

    $('#rows').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const id = btn.closest('tr').dataset.id;
      try {
        if (btn.dataset.act === 'markpaid') {
          if (!confirm('Mark this registration as PAID manually? Use this only for offline payments.')) return;
          await api(`/api/admin/registrations/${id}`, { method: 'PATCH', body: { status: 'paid', notes: 'Marked paid manually by organiser' } });
        } else if (btn.dataset.act === 'checkin') {
          await api('/api/admin/checkin', { body: { ticket_code: btn.closest('tr').querySelector('.code').textContent.trim() } });
        }
        load();
      } catch (err) { alert(err.message); }
    });

    $('#btn-bulk').addEventListener('click', async () => {
      const { rows } = await api('/api/admin/registrations?status=paid&limit=2000');
      const tpl = $('#bulk-text').value;
      const meet = '(see your ticket page for the Google Meet link)';
      for (const r of rows) {
        const text = tpl.replace('{name}', r.name).replace('{meet}', meet).replace('{ticket}', r.ticket_code);
        window.open(`https://wa.me/91${r.phone}?text=${encodeURIComponent(text)}`, '_blank');
      }
      if (!rows.length) alert('No paid attendees yet.');
    });

    $('#btn-copy-nums').addEventListener('click', async () => {
      const { rows } = await api('/api/admin/registrations?status=paid&limit=2000');
      const nums = rows.map((r) => `91${r.phone}`).join(', ');
      try { await navigator.clipboard.writeText(nums); alert(`${rows.length} numbers copied.`); }
      catch { prompt('Copy the numbers:', nums); }
    });

    if (state.token) {
      try { await api('/api/admin/stats'); login(); } catch { logout(); }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
