/**
 * AI Learning Share — Express API + static site.
 *
 *  Public  : register -> pay via UPI -> organiser verifies -> ticket unlocks
 *  Admin   : paid head-count, attendee data, check-in, CSV export
 */
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, pricePaise, isRegistrationOpen } from './src/config.js';
import * as db from './src/db.js';
import { publicTicket, qrDataUri, icsFor, ticketUrl } from './src/ticket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

/* ------------------------------------------------------------ middleware */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

// tiny in-memory rate limiter
const hits = new Map();
function rateLimit(key, max, windowMs) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const rec = hits.get(id) || { n: 0, t: now };
    if (now - rec.t > windowMs) { rec.n = 0; rec.t = now; }
    rec.n += 1;
    hits.set(id, rec);
    if (rec.n > max) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
    next();
  };
}

/* --------------------------------------------------------- admin session */

const sign = (payload) =>
  crypto.createHmac('sha256', config.admin.sessionSecret).update(payload).digest('base64url');

function makeToken() {
  const exp = Date.now() + config.admin.sessionHours * 3600 * 1000;
  const payload = `${exp}`;
  return `${payload}.${sign(payload)}`;
}

function adminAuth(req, res, next) {
  const token = req.get('x-admin-token') || (req.query.token ?? '');
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || sig !== sign(payload)) return res.status(401).json({ error: 'Not authenticated' });
  if (Number(payload) < Date.now()) return res.status(401).json({ error: 'Session expired, log in again' });
  req.admin = true;
  next();
}

/* ------------------------------------------------------------- utilities */

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(`[api] ${req.method} ${req.path} ->`, e.message);
  res.status(500).json({ error: 'Server error', detail: e.message });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateRegistration(b) {
  const errors = [];
  const name = String(b.name || '').trim();
  const email = db.normalizeEmail(b.email);
  const phone = db.normalizePhone(b.phone);
  if (name.length < 2) errors.push('Name is required (at least 2 characters)');
  if (name.length > 80) errors.push('Name is too long');
  if (!EMAIL_RE.test(email)) errors.push('A valid email is required');
  if (!/^[6-9]\d{9}$/.test(phone)) errors.push('A valid 10-digit Indian mobile number is required');
  return { errors, clean: {
    name,
    email,
    phone,
    college: String(b.college || '').trim().slice(0, 120),
    course: String(b.course || '').trim().slice(0, 80),
    year: String(b.year || '').trim().slice(0, 20),
    source: String(b.source || 'website').slice(0, 40),
  } };
}

function baseUrl(req) {
  if (config.server.publicBaseUrl) return config.server.publicBaseUrl.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

/* =========================================================== PUBLIC API */

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, backend: db.backend, payments: config.contact.upiId ? 'upi' : 'not-configured', time: new Date().toISOString() }),
);

app.get('/api/config', (_req, res) => {
  const e = config.event;
  const amount = pricePaise();
  res.json({
    event: {
      title: e.title,
      title_tamil: e.titleTamil,
      tagline: e.tagline,
      tagline_tamil: e.taglineTamil,
      starts_at: e.startsAt,
      duration_minutes: e.durationMinutes,
      timezone: e.timezone,
      seats_total: e.seatsTotal,
      registration_open: isRegistrationOpen(),
    },
    price: { amount_paise: amount, currency: e.currency, display: `₹${amount / 100}` },
    payments: {
      upi: { enabled: Boolean(config.contact.upiId), id: config.contact.upiId, name: config.contact.organizerName },
    },
    contact: config.contact,
  });
});

// 1) REGISTER
app.post('/api/register', rateLimit('reg', 20, 60_000), wrap(async (req, res) => {
  if (!isRegistrationOpen()) return res.status(403).json({ error: 'Registration is closed.' });

  const { errors, clean } = validateRegistration(req.body || {});
  if (errors.length) return res.status(422).json({ errors });

  const amount = pricePaise();

  // Idempotent: reuse an existing record for the same email.
  // Only overwrite fields the caller actually supplied, so a shorter
  // re-registration can never wipe data we already have.
  let row = await db.getByEmail(clean.email);
  if (row) {
    const patch = {};
    for (const k of ['name', 'phone', 'college', 'course', 'year']) if (clean[k]) patch[k] = clean[k];
    if (Object.keys(patch).length) row = await db.updateRegistration(row.id, patch);
  } else {
    row = await db.createRegistration({ ...clean, amount_paise: amount });
  }

  res.json({
    registration_id: row.id,
    ticket_code: row.ticket_code,
    status: row.status,
    amount_paise: amount,
    already_paid: row.status === 'paid',
    ticket_url: ticketUrl(row, baseUrl(req)),
  });
}));

// Direct-UPI payment helpers (no gateway — buyer pays in their own UPI app,
// organiser confirms from the dashboard).
app.get('/api/upi-qr', rateLimit('upi', 60, 60_000), wrap(async (_req, res) => {
  if (!config.contact.upiId) return res.status(404).json({ error: 'UPI is not configured' });
  const svg = await qrDataUri(upiString());
  res.type('image/svg+xml').send(svg);
}));

function upiString(note) {
  const amount = pricePaise() / 100;
  const p = new URLSearchParams({
    pa: config.contact.upiId,
    pn: config.contact.organizerName,
    am: String(amount),
    cu: config.event.currency,
    tn: note || `${config.event.calendarTitle} — seat`,
  });
  return `upi://pay?${p.toString()}`;
}

app.post('/api/payment/upi-notify', rateLimit('verify', 30, 60_000), wrap(async (req, res) => {
  const { registration_id, ticket_code, utr } = req.body || {};
  const row = ticket_code
    ? await db.getByTicketCode(String(ticket_code))
    : await db.getById(String(registration_id || ''));
  if (!row) return res.status(404).json({ error: 'Registration not found. Please fill the form first.' });
  const ref = String(utr || '').replace(/\s+/g, '').slice(0, 40);
  if (ref.length < 6) return res.status(422).json({ error: 'Enter the UPI transaction / reference number from your UPI app.' });
  await db.updateRegistration(row.id, { notes: `UPI ref ${ref} — awaiting verification` });
  res.json({ ok: true, ticket_code: row.ticket_code, status: row.status });
}));

// 5) FIND MY TICKET (email + phone must both match)
app.post('/api/lookup', rateLimit('lookup', 15, 60_000), wrap(async (req, res) => {
  const email = db.normalizeEmail(req.body?.email);
  const phone = db.normalizePhone(req.body?.phone);
  if (!email || !phone) return res.status(422).json({ error: 'Email and mobile number are required' });
  const row = await db.getByEmail(email);
  if (!row || row.phone !== phone) return res.status(404).json({ error: 'No ticket found for that email + mobile combination.' });
  res.json({ ticket_code: row.ticket_code, status: row.status, ticket_url: ticketUrl(row, baseUrl(req)) });
}));

// 5) TICKET LOOKUP
app.get('/api/ticket/:code', rateLimit('ticket', 60, 60_000), wrap(async (req, res) => {
  const row = await db.getByTicketCode(req.params.code);
  if (!row) return res.status(404).json({ error: 'Ticket not found. Check the code and try again.' });
  const ticket = publicTicket(row, baseUrl(req));
  ticket.qr_svg = await qrDataUri(ticketUrl(row, baseUrl(req)));
  res.json({ ticket });
}));

app.get('/api/ticket/:code/ics', wrap(async (req, res) => {
  const row = await db.getByTicketCode(req.params.code);
  if (!row) return res.status(404).send('Ticket not found');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${row.ticket_code}.ics"`);
  res.send(icsFor(row));
}));

/* ============================================================= ADMIN API */

app.post('/api/admin/login', rateLimit('login', 10, 60_000), (req, res) => {
  const pw = String(req.body?.password || '');
  const ok = crypto.timingSafeEqual(Buffer.from(pw.padEnd(64, ' ')), Buffer.from(config.admin.password.padEnd(64, ' ')));
  if (!ok || !pw) return res.status(401).json({ error: 'Wrong password' });
  res.json({ token: makeToken(), expires_hours: config.admin.sessionHours });
});

app.get('/api/admin/stats', adminAuth, wrap(async (_req, res) => {
  const s = await db.stats();
  res.json({ ...s, backend: db.backend, event: config.event.title, generated_at: new Date().toISOString() });
}));

app.get('/api/admin/registrations', adminAuth, wrap(async (req, res) => {
  const rows = await db.listRegistrations({
    status: req.query.status || undefined,
    search: req.query.search || undefined,
    limit: Math.min(Number(req.query.limit) || 500, 5000),
  });
  res.json({ count: rows.length, rows });
}));

app.get('/api/admin/export.csv', adminAuth, wrap(async (req, res) => {
  const rows = await db.listRegistrations({
    status: req.query.status || undefined,
    search: req.query.search || undefined,
    limit: 50000,
  });
  const cols = ['ticket_code','name','email','phone','college','course','year','status','amount_paise','paid_at','attended','check_in_at','notes','created_at'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ai-meet-registrations-${Date.now()}.csv"`);
  res.send(csv);
}));

app.post('/api/admin/checkin', adminAuth, wrap(async (req, res) => {
  const row = await db.getByTicketCode(String(req.body?.ticket_code || ''));
  if (!row) return res.status(404).json({ error: 'Ticket not found' });
  if (row.status !== 'paid') return res.status(403).json({ error: 'This ticket is not paid yet', status: row.status });
  const updated = await db.updateRegistration(row.id, { attended: true, check_in_at: new Date().toISOString() });
  res.json({ ok: true, row: updated });
}));

app.patch('/api/admin/registrations/:id', adminAuth, wrap(async (req, res) => {
  const allowed = ['status', 'notes', 'attended', 'name', 'phone', 'college', 'course', 'year'];
  const patch = {};
  for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  if (patch.status === 'paid' && !patch.paid_at) patch.paid_at = new Date().toISOString();
  if (!Object.keys(patch).length) return res.status(422).json({ error: 'Nothing to update' });
  const row = await db.updateRegistration(req.params.id, patch);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, row });
}));

/* ---------------------------------------------------------------- static */

/*
 * Self-contained pages.
 *
 * The Arena in-app preview (and some file viewers) render HTML inside a
 * sandboxed iframe that cannot fetch external stylesheets/scripts. If we ship
 * the CSS/JS as separate files those previews show a raw, unstyled page —
 * exactly the "frontend crashed" report. So the server inlines the stylesheet
 * and the page's own script into the HTML before sending it. Real browsers get
 * the same document; nothing depends on a second request succeeding.
 */
const pub = (f) => fs.readFileSync(path.join(__dirname, 'public', f), 'utf8');
const STYLE_TAG = `<style>\n${pub('styles.css')}\n</style>`;
const inlinePage = (file, js) =>
  pub(file)
    .replace('<link rel="stylesheet" href="/styles.css" />', STYLE_TAG)
    .replace(`<script src="/${js}"></script>`, `<script>\n${pub(js)}\n</script>`);

const PAGES = {
  '/': inlinePage('index.html', 'app.js'),
  '/index.html': null, // alias, resolved below
  '/ticket.html': inlinePage('ticket.html', 'ticket.js'),
  '/admin.html': inlinePage('admin.html', 'admin.js'),
  '/404.html': pub('404.html').replace('<link rel="stylesheet" href="/styles.css" />', STYLE_TAG),
};
PAGES['/index.html'] = PAGES['/'];

app.get(['/', '/index.html', '/ticket.html', '/admin.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.type('html').send(PAGES[req.path]);
});

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  // HTML must never be served stale — CSS/JS change between deploys and a
  // cached old page is the classic "frontend crashed" cause.
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, must-revalidate');
  },
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.status(404).type('html').send(PAGES['/404.html']);
});

export default app;
export { app };

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(config.server.port, config.server.host, () => {
    console.log(`AI Learning Share running at http://${config.server.host}:${config.server.port}`);
    console.log(`  DB backend : ${db.backend}`);
    console.log(`  Payments   : ${config.contact.upiId ? `Direct UPI (${config.contact.upiId})` : 'NOT CONFIGURED'}`);
    console.log(`  Admin      : /admin.html  (ADMIN_PASSWORD from .env)`);
  });
}
