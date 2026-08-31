/**
 * End-to-end smoke test for the AI Learning Share platform (Direct-UPI, no gateway).
 *
 * Boots the real server and walks the whole flow:
 *   register -> UPI reference submitted -> organiser Mark paid -> ticket unlocks
 *   (meet link + WhatsApp group + QR) -> admin login/stats/CSV/check-in/refund.
 *
 * Run: npm test
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const PORT = 3456;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PASSWORD = 'test_admin_pw';

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`  ✔ ${name}`); }
  else { fail++; results.push(`  ✘ ${name} ${extra}`); }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHealth(base, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return r.json();
    } catch {}
    await wait(250);
  }
  throw new Error(`server at ${base} never became healthy`);
}

function start(name, cmd, args, env) {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.on('exit', (c) => { if (c !== null && c !== 0) console.log(`[${name}] exited ${c}\n${log}`); });
  return { child, log: () => log };
}

const post = (p, b, h = {}) =>
  fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) });

async function main() {
  const dbFile = path.join(os.tmpdir(), `ail-test-${Date.now()}.json`);

  const server = start('server', process.execPath, ['server.js'], {
    PORT, HOST: '127.0.0.1', NODE_ENV: 'production',
    USE_LOCAL_DB: 'true', LOCAL_DB_FILE: dbFile,
    ADMIN_PASSWORD, SERVER_SECRET: 'test-secret',
    GOOGLE_MEET_LINK: 'https://meet.google.com/abc-defg-hij',
    WHATSAPP_GROUP_LINK: 'https://chat.whatsapp.com/TESTGROUP',
    EVENT_PRICE_RUPEES: '99',
    PUBLIC_BASE_URL: BASE,
    UPI_ID: 'test@ybl',
  });

  try {
    const health = await waitForHealth(BASE);

    /* -------------------------------------------------- health & config */
    console.log('\n■ Health / config');
    check('health returns ok', health.ok === true);
    check('falls back to local DB when Supabase is not configured', health.backend === 'local');
    check('payments reported as upi (no gateway)', health.payments === 'upi');

    const cfg = await (await fetch(`${BASE}/api/config`)).json();
    check('config price is 9900 paise', cfg.price.amount_paise === 9900, JSON.stringify(cfg.price));
    check('config exposes the UPI id', cfg.payments?.upi?.enabled === true && cfg.payments.upi.id === 'test@ybl', JSON.stringify(cfg.payments));
    check('config has no card-gateway flag', cfg.payments?.enabled === undefined && cfg.payments?.key_id === undefined);
    check('config does NOT leak the meet link', cfg.event.meet_link === undefined);

    /* ---------------------------------------------------- validation */
    console.log('\n■ Registration validation');
    const bad = await post('/api/register', { name: 'A', email: 'nope', phone: '12345' });
    const badBody = await bad.json();
    check('rejects invalid details with 422', bad.status === 422, `got ${bad.status}`);
    check('returns field errors', Array.isArray(badBody.errors) && badBody.errors.length === 3, JSON.stringify(badBody));

    const reg = await (await post('/api/register', { name: 'Sanjay Kumar', email: 'Sanjay@Example.com ', phone: '07550321307', college: 'GCE Erode', course: 'B.E. CSE', year: '3rd year' })).json();
    check('register returns a ticket code', /^AIL-[A-Z2-9]{6}$/.test(reg.ticket_code), reg.ticket_code);
    check('register stores normalised email + pending status', reg.registration_id && reg.status === 'pending');

    const again = await (await post('/api/register', { name: 'Sanjay Kumar V', email: 'sanjay@example.com', phone: '7550321307' })).json();
    check('re-registering the same email is idempotent', again.ticket_code === reg.ticket_code && again.registration_id === reg.registration_id);

    const afterMerge = await (await fetch(`${BASE}/api/ticket/${reg.ticket_code}`)).json();
    check('re-registration keeps data not supplied again (college)', afterMerge.ticket.college === 'GCE Erode', JSON.stringify(afterMerge.ticket.college));
    check('re-registration updates the fields that were supplied', afterMerge.ticket.name === 'Sanjay Kumar V');

    /* ------------------------------------------- direct UPI (no gateway) */
    console.log('\n■ Direct UPI payment flow');
    const qrRes = await fetch(`${BASE}/api/upi-qr`);
    check('UPI payment QR served as SVG', qrRes.status === 200 && (await qrRes.text()).includes('<svg'));

    const shortUtr = await post('/api/payment/upi-notify', { registration_id: reg.registration_id, utr: '123' });
    check('short UPI reference rejected (422)', shortUtr.status === 422);

    const notify = await (await post('/api/payment/upi-notify', { registration_id: reg.registration_id, utr: 'UTR 523419887654' })).json();
    check('UPI notify accepted and returns ticket code', notify.ok === true && notify.ticket_code === reg.ticket_code, JSON.stringify(notify));

    const prePay = await (await fetch(`${BASE}/api/ticket/${reg.ticket_code}`)).json();
    check('meet link stays hidden while unpaid', prePay.ticket.event.meet_link === '');
    check('WhatsApp group stays hidden while unpaid', prePay.ticket.event.whatsapp_group_link === '');
    check('status still pending before organiser verifies', prePay.ticket.status === 'pending');

    /* --------------------------------------------------------- admin */
    console.log('\n■ Admin dashboard API');
    const noAuth = await fetch(`${BASE}/api/admin/stats`);
    check('stats require auth (401)', noAuth.status === 401);
    const badLogin = await post('/api/admin/login', { password: 'wrong' });
    check('wrong admin password rejected (401)', badLogin.status === 401);

    const login = await (await post('/api/admin/login', { password: ADMIN_PASSWORD })).json();
    check('login returns a token', Boolean(login.token));
    const H = { 'x-admin-token': login.token };

    const upiRow = await (await fetch(`${BASE}/api/admin/registrations?search=${reg.ticket_code}`, { headers: H })).json();
    check('UPI reference visible to organiser', String(upiRow.rows?.[0]?.notes || '').includes('UPI ref UTR523419887654'), JSON.stringify(upiRow.rows?.[0]?.notes));

    const mark = await (await fetch(`${BASE}/api/admin/registrations/${reg.registration_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...H }, body: JSON.stringify({ status: 'paid' }) })).json();
    check('organiser Mark paid sets status + paid_at', mark.row?.status === 'paid' && Boolean(mark.row?.paid_at), JSON.stringify(mark.row?.status));

    const paidTicket = await (await fetch(`${BASE}/api/ticket/${reg.ticket_code}`)).json();
    check('Google Meet link revealed after Mark paid', paidTicket.ticket?.event?.meet_link === 'https://meet.google.com/abc-defg-hij');
    check('WhatsApp group link revealed after Mark paid', paidTicket.ticket?.event?.whatsapp_group_link === 'https://chat.whatsapp.com/TESTGROUP');
    check('QR code SVG generated on the ticket', String(paidTicket.ticket?.qr_svg || '').includes('<svg'));

    const stats = await (await fetch(`${BASE}/api/admin/stats`, { headers: H })).json();
    check('stats count 1 registration', stats.total === 1, JSON.stringify(stats));
    check('stats count 1 paid', stats.paid === 1);
    check('revenue is ₹99', stats.revenue_paise === 9900, String(stats.revenue_paise));
    check('conversion is 100%', stats.conversion_pct === 100);
    check('daily chart has an entry', stats.by_day.length === 1);

    const paidList = await (await fetch(`${BASE}/api/admin/registrations?status=paid`, { headers: H })).json();
    check('paid filter returns the attendee', paidList.count === 1 && paidList.rows[0].name === 'Sanjay Kumar V');
    const search = await (await fetch(`${BASE}/api/admin/registrations?search=ero`, { headers: H })).json();
    check('search matches college', search.count === 1);
    const searchName = await (await fetch(`${BASE}/api/admin/registrations?search=sanjay`, { headers: H })).json();
    check('search matches name', searchName.count === 1);
    const searchWeird = await fetch(`${BASE}/api/admin/registrations?search=a%2Cb)%25`, { headers: H });
    check('search with PostgREST syntax chars does not crash', searchWeird.status === 200);

    const csv = await (await fetch(`${BASE}/api/admin/export.csv`, { headers: H })).text();
    check('CSV export has a header row', csv.split('\n')[0].startsWith('ticket_code,'));
    check('CSV export contains the attendee', csv.includes('sanjay@example.com') && csv.includes('7550321307'));
    check('CSV export includes the notes column', csv.split('\n')[0].includes(',notes,'));
    check('CSV no longer has razorpay columns', !csv.split('\n')[0].includes('razorpay'));

    const checkin = await (await post('/api/admin/checkin', { ticket_code: reg.ticket_code }, H)).json();
    check('check-in marks attended', checkin.row?.attended === true && Boolean(checkin.row?.check_in_at));

    /* --------------------------------------------- upi-notify by ticket */
    console.log('\n■ UPI notify via ticket code (ticket page path)');
    const reg2 = await (await post('/api/register', { name: 'Second Person', email: 'second@example.com', phone: '9876543210' })).json();
    const notifyByCode = await (await post('/api/payment/upi-notify', { ticket_code: reg2.ticket_code, utr: '998877665544' })).json();
    check('upi-notify accepts a ticket_code', notifyByCode.ok === true && notifyByCode.ticket_code === reg2.ticket_code, JSON.stringify(notifyByCode));

    /* ------------------------------------------------------ ticket API */
    console.log('\n■ Ticket endpoints');
    const t = await (await fetch(`${BASE}/api/ticket/${reg.ticket_code.toLowerCase()}`)).json();
    check('ticket lookup is case-insensitive', t.ticket?.ticket_code === reg.ticket_code);
    const t404 = await fetch(`${BASE}/api/ticket/AIL-NOPE99`);
    check('unknown ticket returns 404', t404.status === 404);
    const ics = await (await fetch(`${BASE}/api/ticket/${reg.ticket_code}/ics`)).text();
    check('calendar file generated', ics.startsWith('BEGIN:VCALENDAR') && ics.includes('BEGIN:VEVENT'));

    const lookup = await (await post('/api/lookup', { email: 'sanjay@example.com', phone: '7550321307' })).json();
    check('find-my-ticket works with email+phone', lookup.ticket_code === reg.ticket_code);
    const lookupBad = await post('/api/lookup', { email: 'sanjay@example.com', phone: '9999999999' });
    check('find-my-ticket rejects a wrong phone', lookupBad.status === 404);

    /* --------------------------------------------------------- refund */
    console.log('\n■ Refund');
    const patch = await (await fetch(`${BASE}/api/admin/registrations/${reg.registration_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...H }, body: JSON.stringify({ status: 'refunded', notes: 'test refund' }) })).json();
    check('manual status update works', patch.row?.status === 'refunded');
    const stats2 = await (await fetch(`${BASE}/api/admin/stats`, { headers: H })).json();
    check('refund drops revenue to 0', stats2.revenue_paise === 0 && stats2.refunded === 1, JSON.stringify(stats2));

    /* ------------------------------------------------------ static UI */
    console.log('\n■ Static pages');
    const home = await (await fetch(`${BASE}/`)).text();
    check('landing page serves', home.includes('AI Learning Share'));
    check('landing has no Razorpay checkout script', !home.includes('checkout.razorpay.com'));
    check('landing shows the UPI block', home.includes('upi-alt'));
    for (const p of ['/ticket.html', '/admin.html', '/styles.css', '/app.js', '/ticket.js', '/admin.js']) {
      const r = await fetch(BASE + p);
      check(`${p} serves (200)`, r.status === 200);
    }
    const nf = await fetch(`${BASE}/does-not-exist`);
    check('404 page for unknown route', nf.status === 404 && (await nf.text()).includes('404'));

    /* ------------------------------------------------- persistence */
    console.log('\n■ Persistence');
    const saved = JSON.parse(fs.readFileSync(dbFile, 'utf8')).registrations;
    check('registrations persisted to disk', saved.length === 2);
    check('UPI reference persisted in notes', String(saved.find((r) => r.id === reg2.registration_id)?.notes || '').includes('UPI ref 998877665544'));
    check('refund note persisted', String(saved.find((r) => r.id === reg.registration_id)?.notes || '') === 'test refund');
    fs.rmSync(dbFile, { force: true });
  } finally {
    server.child.kill();
    await wait(300);
  }

  console.log('\n' + results.join('\n'));
  console.log(`\n──────────────────────────────\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('SMOKE TEST CRASHED:', e); process.exit(1); });
