/**
 * Tester data seeder — talks to a RUNNING server through its public API.
 * No gateway: statuses are applied via the admin API (Mark paid / refund)
 * (the same "Mark paid / refund" path a real organiser uses).
 *   node scripts/seed-demo.mjs
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'share#12345';

const people = [
  { name: 'Priya Dharshini', email: 'priya.d@gmail.com', phone: '9842112233', college: 'GCE Erode', course: 'B.E. CSE', year: '3rd year' },
  { name: 'Karthik Raja', email: 'karthik.raja@gmail.com', phone: '8778012345', college: 'Kongu Engineering College', course: 'B.Tech IT', year: '4th year' },
  { name: 'Meena Lakshmi', email: 'meena.l@gmail.com', phone: '9003456781', college: 'SNS College of Technology', course: 'B.Sc Data Science', year: '2nd year' },
  { name: 'Arun Prasad', email: 'arun.prasad@gmail.com', phone: '9791234560', college: 'Bannari Amman Institute', course: 'B.E. ECE', year: '3rd year' },
  { name: 'Divya Bharathi', email: 'divya.b@gmail.com', phone: '9600112244', college: 'PSG Tech', course: 'MCA', year: '1st year' },
  { name: 'Vigneshwaran S', email: 'vignesh.s@gmail.com', phone: '8056789012', college: 'Erode Sengunthar College', course: 'BCA', year: '2nd year' },
  { name: 'Rahul Kumar', email: 'rahul.k@gmail.com', phone: '9955667788', college: 'SKCT Coimbatore', course: 'B.Com', year: '3rd year' },
  { name: 'Anitha S', email: 'anitha.s@gmail.com', phone: '9123450987', college: 'Avinashilingam University', course: 'B.Sc IT', year: '4th year' },
];

const post = (p, b, h = {}) =>
  fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) }).then(async (r) => ({
    status: r.status, body: await r.json().catch(() => ({})),
  }));
const patch = (p, b, h) =>
  fetch(BASE + p, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) }).then(async (r) => ({
    status: r.status, body: await r.json().catch(() => ({})),
  }));

const run = async () => {
  const rows = [];
  for (const p of people) {
    const r = await post('/api/register', p);
    rows.push({ ...p, id: r.body.registration_id, code: r.body.ticket_code });
  }

  const login = await post('/api/admin/login', { password: ADMIN_PASSWORD });
  const H = { 'x-admin-token': login.body.token };

  // 4 paid (first one also checked in), 2 pending, 1 failed, 1 refunded
  for (let i = 0; i < 4; i++) {
    await patch(`/api/admin/registrations/${rows[i].id}`, { status: 'paid', notes: 'UPI verified (demo)' }, H);
  }
  await post('/api/admin/checkin', { ticket_code: rows[0].code }, H);
  await patch(`/api/admin/registrations/${rows[5].id}`, { status: 'failed', notes: 'UPI ref not received (demo)' }, H);
  await patch(`/api/admin/registrations/${rows[7].id}`, { status: 'refunded', notes: 'Refunded (demo)' }, H);
  // rows[4], rows[6] stay pending

  const s = await (await fetch(BASE + '/api/admin/stats', { headers: H })).json();
  console.log(`Seeded: ${s.total} registrations · ${s.paid} paid · ${s.pending} pending · ${s.failed} failed · ${s.refunded} refunded · ₹${s.revenue_paise / 100} revenue`);
  console.log(`Dashboard tabs to view: /admin.html (All / Paid / Pending / Failed / Refunded)`);
};

run().catch((e) => { console.error(e); process.exit(1); });
