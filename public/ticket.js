/* Ticket page: lookup, display, resume payment */
(() => {
  const $ = (s) => document.querySelector(s);
  const state = { ticket: null, contact: null };

  const wa = (num, text) => `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  async function api(path, body, method) {
    const res = await fetch(path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function render(t) {
    state.ticket = t;
    $('#lookup').classList.add('hidden');
    $('#ticket-view').classList.remove('hidden');

    const st = $('#t-status');
    st.textContent = t.status;
    st.className = `stamp ${t.status}`;

    $('#t-event').textContent = t.event.title;
    $('#t-when').textContent = `${t.event.starts_at_display} IST · ${Math.round(t.event.duration_minutes / 60)} hours · Google Meet`;
    $('#t-code').textContent = t.ticket_code;
    $('#t-name').textContent = t.name;
    $('#t-email').textContent = t.email;
    $('#t-phone').textContent = t.phone;
    $('#t-college').textContent = t.college || '—';
    $('#t-amount').textContent = t.status === 'paid' ? `₹${t.amount_display}` : `₹${t.amount_display} (pending)`;
    $('#t-issued').textContent = fmt(t.issued_at);
    $('#t-qr').innerHTML = t.qr_svg || '';

    const paid = t.status === 'paid';
    $('#paid-only').classList.toggle('hidden', !paid);
    $('#pending-only').classList.toggle('hidden', paid);

    const banner = $('#paid-banner');
    banner.classList.toggle('hidden', !paid);
    if (paid) {
      banner.textContent = 'Payment received. Your seat is confirmed — join the WhatsApp group below for updates and the materials link.';
      const meet = $('#t-meet');
      meet.href = t.event.meet_link || '#';
      meet.textContent = t.event.meet_link || 'Meet link not set yet — check WhatsApp';
      $('#t-meet-raw').textContent = t.event.meet_link
        ? 'Opens in a new tab. Keep this page open during the session.'
        : '';
      $('#t-ics').href = `/api/ticket/${t.ticket_code}/ics`;

      const grp = $('#t-wa-group');
      if (t.event.whatsapp_group_link) { grp.href = t.event.whatsapp_group_link; grp.classList.remove('hidden'); }
      else { grp.classList.add('hidden'); }

      const drv = $('#t-drive');
      if (t.event.drive_folder_link) { drv.href = t.event.drive_folder_link; drv.classList.remove('hidden'); }
      else { drv.classList.add('hidden'); }
    } else {
      setupPendingUpi(t);
    }

    if (state.contact) {
      const waNum = state.contact.whatsapp_number || state.contact.whatsappNumber || '917550321307';
      const cleanWa = waNum.replace(/^\+/, '').replace(/^91(?=\d{10})/, '');
      const mail = state.contact.email || 'sanjaykumarvpk@gmail.com';
      const msg = `Hi! My ticket is ${t.ticket_code} — I need help with my registration.`;
      $('#t-wa-help').href = wa(waNum, msg);
      $('#t-wa-help2').href = wa(waNum, msg);
      $('#t-contact').textContent = `${mail} · ${cleanWa}`;
    }

    document.title = `${t.ticket_code} — AI Learning Share`;
    history.replaceState(null, '', `/ticket.html?code=${encodeURIComponent(t.ticket_code)}`);
  }

  async function load(code) {
    try {
      const { ticket } = await api(`/api/ticket/${encodeURIComponent(code)}`);
      render(ticket);
    } catch (err) {
      const box = $('#lookup-alert');
      box.textContent = err.message;
      box.classList.remove('hidden');
    }
  }

  /* Pending tickets pay by direct UPI (no gateway): QR + deep link + reference. */
  function setupPendingUpi(t) {
    const upi = state.cfg?.payments?.upi;
    const box = $('#t-upi-box');
    if (!upi?.enabled) { if (box) box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    $('#t-upi-amt').textContent = `₹${t.amount_display}`;
    $('#t-upi-id').textContent = upi.id;
    fetch('/api/upi-qr').then((r) => (r.ok ? r.text() : '')).then((svg) => { if (svg) $('#t-upi-qr').innerHTML = svg; }).catch(() => {});
    $('#t-upi-open').onclick = () => {
      window.location.href = `upi://pay?pa=${encodeURIComponent(upi.id)}&pn=${encodeURIComponent(upi.name)}&am=${t.amount_display}&cu=INR&tn=${encodeURIComponent(`${t.ticket_code} — seat`)}`;
    };
  }

  async function notifyPaid() {
    const box = $('#pay-alert');
    box.classList.add('hidden');
    const utr = $('#t-upi-utr').value.trim();
    if (utr.replace(/\s+/g, '').length < 6) {
      box.className = 'alert bad'; box.textContent = 'Enter the reference number from your UPI app.'; box.classList.remove('hidden');
      return;
    }
    const btn = $('#t-upi-notify');
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      await api('/api/payment/upi-notify', { ticket_code: state.ticket.ticket_code, utr });
      box.className = 'alert ok';
      box.textContent = 'Reference received! Click the button below to send your confirmation on WhatsApp to Sanjay for instant verification:';
      box.classList.remove('hidden');
      const waNum = state.contact?.whatsapp_number || state.contact?.whatsappNumber || '917550321307';
      const waText = `Hi Sanjay, I have paid ₹${state.ticket.amount_display} for the AI Learning Share Masterclass!\n\n👤 Name: ${state.ticket.name}\n📱 Mobile: ${state.ticket.phone}\n🎟️ Ticket: ${state.ticket.ticket_code}\n🔢 UPI Ref: ${utr}`;
      const waBtn = $('#t-wa-send-proof');
      if (waBtn) {
        waBtn.href = wa(waNum, waText);
        waBtn.classList.remove('hidden');
      }
      $('#t-upi-utr').value = '';
    } catch (err) {
      box.className = 'alert bad'; box.textContent = err.message; box.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'I have paid — unlock my ticket';
    }
  }

  async function init() {
    $('#yr').textContent = new Date().getFullYear();
    try { state.cfg = await api('/api/config'); state.contact = state.cfg.contact; } catch {}

    $('#lookup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const codeOrEmail = $('#code').value.trim();
      if (!codeOrEmail) {
        const email = prompt('Enter the email you registered with:');
        if (!email) return;
        const phone = prompt('Enter the mobile number you registered with:');
        if (!phone) return;
        return api('/api/lookup', { email, phone })
          .then((r) => load(r.ticket_code))
          .catch((err) => {
            const box = $('#lookup-alert');
            box.textContent = err.message; box.classList.remove('hidden');
          });
      }
      if (codeOrEmail.includes('@')) {
        load(codeOrEmail);
      } else {
        load(codeOrEmail.toUpperCase());
      }
    });

    $('#t-upi-notify').addEventListener('click', notifyPaid);
    $('#t-share').addEventListener('click', async () => {
      const url = location.href;
      if (navigator.share) { try { await navigator.share({ title: 'My AI Masterclass ticket', url }); return; } catch {} }
      try { await navigator.clipboard.writeText(url); alert('Ticket link copied!'); }
      catch { alert(url); }
    });

    // Owner-only: Ctrl+Shift+A opens the organiser dashboard (no public link anywhere).
    window.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey && ev.shiftKey && (ev.key === 'A' || ev.key === 'a')) {
        ev.preventDefault();
        window.location.href = '/admin.html';
      }
    });

    const code = new URLSearchParams(location.search).get('code');
    if (code) load(code);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
