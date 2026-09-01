/* Landing page: config, countdown, contacts, register -> pay via UPI -> ticket */
(() => {
  const $ = (s) => document.querySelector(s);
  const state = { config: null };

  const dateFmt = (iso, tz, opts) => new Intl.DateTimeFormat('en-IN', { timeZone: tz, ...opts }).format(new Date(iso));
  const waLink = (num, text) => `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

  const showErrors = (map) =>
    document.querySelectorAll('[data-err]').forEach((el) => { el.textContent = map[el.dataset.err] || ''; });

  function alertBox(type, msg) {
    const box = $('#form-alert');
    box.className = `alert ${type}`;
    box.textContent = msg;
    box.classList.remove('hidden');
    return box;
  }

  function validate() {
    const v = {
      name: $('#name').value.trim(),
      email: $('#email').value.trim(),
      phone: $('#phone').value.replace(/\D/g, ''),
    };
    const errs = {};
    if (v.name.length < 2) errs.name = 'Please enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errs.email = 'Enter a valid email address';
    if (!/^[6-9]\d{9}$/.test(v.phone)) errs.phone = 'Enter a valid 10-digit mobile number';
    showErrors(errs);
    return { ok: !Object.keys(errs).length, v };
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || data.errors?.join(', ') || `Request failed (${res.status})`), { data });
    return data;
  }

  /* ---------------------------------------------------------- countdown */
  function tick(iso, tz) {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) {
      const el = $('#countdown');
      if (el && !el.dataset.done) {
        el.dataset.done = '1';
        el.innerHTML = '<div style="flex:1;text-align:left;padding:14px 4px"><b style="font-size:clamp(20px,3vw,28px)">Live now</b><span style="display:block">Join from your ticket</span></div>';
      }
      return false;
    }
    const set = (id, v) => { const e = $(id); if (e) e.textContent = String(v).padStart(2, '0'); };
    set('#cd-d', Math.floor(diff / 86400000));
    set('#cd-h', Math.floor(diff / 3600000) % 24);
    set('#cd-m', Math.floor(diff / 60000) % 60);
    set('#cd-s', Math.floor(diff / 1000) % 60);
    return true;
  }

  /* ------------------------------------------------- register -> UPI pay */
  async function handleSubmit(e) {
    e.preventDefault();
    const { ok, v } = validate();
    if (!ok) return;

    const btn = $('#pay-btn');
    btn.dataset.label = btn.dataset.label || btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving your seat…';

    try {
      const reg = await api('/api/register', {
        name: v.name, email: v.email, phone: v.phone,
        college: $('#college').value, course: $('#course').value, year: $('#year').value,
      });
      state.lastTicket = reg.ticket_code;

      if (reg.already_paid) {
        alertBox('ok', 'This email is already registered and paid. Opening your ticket…');
        setTimeout(() => (window.location.href = reg.ticket_url), 900);
        return;
      }

      // Seat saved — now take the buyer to the UPI block to pay & submit the reference.
      alertBox('ok', `Seat saved! Your ticket code is ${reg.ticket_code}. Now pay ${state.config.price.display} via UPI below and paste the reference number — we verify and unlock your ticket in minutes.`);
      const upi = $('#upi-alt');
      if (upi) {
        upi.classList.remove('hidden');
        upi.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => $('#upi-utr')?.focus({ preventScroll: true }), 500);
      }
    } catch (err) {
      alertBox('bad', err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label;
    }
  }

  /* --------------------------------------------------- reveal on scroll */
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    els.forEach((e) => io.observe(e));
  }

  /* ------------------------------------------------------------- init */
  async function init() {
    $('#yr').textContent = new Date().getFullYear();
    initReveal();

    let cfg;
    try {
      cfg = await api('/api/config');
    } catch (err) {
      alertBox('bad', 'Could not load event details: ' + err.message);
      return;
    }
    state.config = cfg;
    const e = cfg.event, c = cfg.contact;

    document.title = `${e.title} — Register`;

    $('#lead').textContent = e.tagline;
    $('#lead-ta').textContent = e.tagline_tamil;

    $('#fact-date').textContent = dateFmt(e.starts_at, e.timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#fact-time').textContent = `${dateFmt(e.starts_at, e.timezone, { hour: 'numeric', minute: '2-digit' })} IST`;
    const hrs = Math.floor(e.duration_minutes / 60), mins = e.duration_minutes % 60;
    $('#fact-dur').textContent = mins ? `${hrs} hrs ${mins} min` : `${hrs} hours`;

    const rupees = cfg.price.amount_paise / 100;
    $('#fact-price').textContent = `${cfg.price.display} only`;
    $('#price').innerHTML = `<sup>₹</sup>${rupees}`;
    $('#stub-price').textContent = `₹${rupees}`;
    $('#pay-amount').textContent = cfg.price.display;
    if ($('#bonus-price')) $('#bonus-price').textContent = cfg.price.display;
    if ($('#bonus-title-price')) $('#bonus-title-price').textContent = cfg.price.display;
    if ($('#cta-price')) $('#cta-price').textContent = cfg.price.display;
    if ($('#offer-bar-price')) $('#offer-bar-price').textContent = `${cfg.price.display} only`;

    $('#pill-status').textContent = e.registration_open ? 'Registrations open' : 'Registration closed';

    const waNum = c?.whatsapp_number || c?.whatsappNumber || '917550321307';
    const urgentNum = c?.urgent_call_number || c?.urgentCallNumber || waNum;
    const contactEmail = c?.email || 'sanjaykumarvpk@gmail.com';

    const waMsg = 'Hi! I want to join the AI Learning Share masterclass.';
    const setWa = (sel) => { const el = $(sel); if (el) el.href = waLink(waNum, waMsg); };
    setWa('#wa-top'); setWa('#wa-contact'); setWa('#f-wa');
    $('#c-phone').textContent = `+${waNum}`;
    ['#c-call', '#c-call2', '#f-call'].forEach((sel) => { const el = $(sel); if (el) el.href = `tel:+${urgentNum}`; });
    ['#c-mail', '#f-mail'].forEach((sel) => {
      const el = $(sel);
      if (el) { el.href = `mailto:${contactEmail}`; el.textContent = contactEmail; }
    });

    if (e.registration_open) {
      tick(e.starts_at, e.timezone);
      setInterval(() => tick(e.starts_at, e.timezone), 1000);
    } else {
      tick('2000-01-01T00:00:00+05:30', e.timezone); // renders the "live now / closed" state
      $('#pill-status').textContent = 'Registration closed';
      $('#pay-btn').disabled = true;
    }

    /* ------------------------------------------- direct UPI (the only method) */
    const upi = cfg.payments?.upi;
    if (upi?.enabled) {
      $('#upi-alt').classList.remove('hidden');
      $('#upi-id').textContent = upi.id;
      fetch('/api/upi-qr').then((r) => (r.ok ? r.text() : '')).then((svg) => { if (svg) $('#upi-qr').innerHTML = svg; }).catch(() => {});
      const upiLink = `upi://pay?pa=${encodeURIComponent(upi.id)}&pn=${encodeURIComponent(upi.name)}&am=${cfg.price.amount_paise / 100}&cu=${cfg.price.currency}&tn=${encodeURIComponent('AI Learning Share seat')}`;
      $('#upi-open').addEventListener('click', () => { window.location.href = upiLink; });

      $('#upi-notify').addEventListener('click', async () => {
        const { ok, v } = validate();
        const utr = $('#upi-utr').value.trim();
        const errs = {};
        if (utr.replace(/\s+/g, '').length < 6) errs.utr = 'Enter the reference number from your UPI app';
        showErrors(errs);
        if (!ok || errs.utr) return;
        const btn = $('#upi-notify');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Submitting…';
        try {
          const reg = await api('/api/register', {
            name: v.name, email: v.email, phone: v.phone,
            college: $('#college').value, course: $('#course').value, year: $('#year').value,
          });
          const done = await api('/api/payment/upi-notify', { registration_id: reg.registration_id, utr });
          alertBox('ok', `Thanks ${v.name}! We received your reference. Your ticket ${done.ticket_code} unlocks as soon as we verify the payment (usually within minutes). Track it any time: /ticket.html?code=${done.ticket_code}`);
          $('#upi-utr').value = '';
        } catch (err) {
          alertBox('bad', err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'I have paid — verify & unlock my ticket';
        }
      });
    }

    $('#reg-form').addEventListener('submit', handleSubmit);

    // Owner-only: Ctrl+Shift+A opens the organiser dashboard (no public link anywhere).
    window.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey && ev.shiftKey && (ev.key === 'A' || ev.key === 'a')) {
        ev.preventDefault();
        window.location.href = '/admin.html';
      }
    });
    $('#phone').addEventListener('input', (ev) => { ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, 10); });

    const p = new URLSearchParams(location.search);
    if (p.get('email')) $('#email').value = p.get('email');
    if (p.get('register') === '1') $('#register').scrollIntoView({ behavior: 'smooth' });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
