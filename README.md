# AI Learning Share — Event Platform

Live Google Meet masterclass: **registration → direct UPI payment → e-ticket (QR) → WhatsApp group**, with an
**organiser dashboard** (how many paid, their data, revenue, check-in, CSV export).

Backend: **Node + Express + Supabase** (falls back to a local JSON file so it runs with zero setup).
Payments are **gateway-free by design**: buyers pay your UPI id in their own app (GPay / PhonePe / Paytm),
paste the reference number, and you confirm it in the dashboard. No Razorpay, no card details, no PCI scope.

---

## 1. Quick start (runs immediately, no accounts needed)

```bash
cd ai-meet-platform
npm install
cp .env.example .env      # then edit .env
npm start                 # http://localhost:3000
```

The only payment method is **Direct UPI**: a QR + "Open my UPI app" deep link built from `UPI_ID`
(set it in `.env`; leave empty to hide the option). After paying in any UPI app the buyer pastes the
reference number, you confirm it in the dashboard (**Mark paid**) and the ticket unlocks. Data is stored
in `data/db.json` until Supabase is connected.

| Page | URL |
|---|---|
| Landing / register / pay | `/` |
| E-ticket (QR, meet link, calendar) | `/ticket.html` |
| Organiser dashboard | `/admin.html` (password = `ADMIN_PASSWORD`) |
| API health | `/api/health` |

## 2. Go live — 4 steps

1. **UPI** — put your UPI id in `UPI_ID` (e.g. `yourname@oksbi`). That is the whole payment setup.
2. **Supabase** — create a project, run `supabase/schema.sql` in the SQL editor, copy
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` into `.env`, set `USE_LOCAL_DB=false`.
3. **Event details** — `EVENT_STARTS_AT`, `EVENT_PRICE_RUPEES`, `GOOGLE_MEET_LINK`, `WHATSAPP_GROUP_LINK`,
   `DRIVE_FOLDER_LINK`.
4. **Deploy** — Render / Railway / any VPS with Node 18+. Set `PUBLIC_BASE_URL` to your HTTPS domain
   (it is used to build the QR code links). Change `ADMIN_PASSWORD` and `SERVER_SECRET`.

## 3. Money flow (Direct UPI — no gateway)

```
POST /api/register        -> ticket_code + registration row (status=pending)
GET  /api/upi-qr          -> SVG QR encoding upi://pay?pa=<UPI_ID>&pn=&am=99&cu=INR
                             (plus an "Open my UPI app" deep link on the page)
buyer pays in GPay/PhonePe/Paytm, then pastes the UPI reference no.
POST /api/payment/upi-notify -> stores the ref in the registration `notes`
                             -> shows in the dashboard + CSV as "UPI ref … awaiting verification"
organiser checks the ref against their UPI app, then Mark paid
PATCH /api/admin/registrations/:id -> status=paid -> meet link + WhatsApp group unlocked
```

No money ever touches this server — the UPI payment goes straight to your UPI id; the site only records
the reference so you can verify it. If `UPI_ID` is empty the whole UPI block is hidden. The same UPI block
also appears on a pending ticket, so a buyer can finish payment from any device.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | public event info, price, contacts (never the meet link) |
| POST | `/api/register` | create / update a registration (idempotent by email) |
| GET | `/api/upi-qr` | SVG QR for the direct-UPI option |
| POST | `/api/payment/upi-notify` | record a buyer's UPI reference (by registration id or ticket code) |
| POST | `/api/lookup` | "find my ticket" by email + mobile |
| GET | `/api/ticket/:code` | ticket JSON + QR (meet link only when paid) |
| GET | `/api/ticket/:code/ics` | Google Calendar / Outlook file |
| POST | `/api/admin/login` | `{password}` → session token |
| GET | `/api/admin/stats` | totals, paid count, revenue, conversion, daily chart |
| GET | `/api/admin/registrations` | `?status=paid&search=&limit=` |
| GET | `/api/admin/export.csv` | full export |
| POST | `/api/admin/checkin` | `{ticket_code}` → mark attended |
| PATCH | `/api/admin/registrations/:id` | manual status / notes |

Admin routes need the header `x-admin-token` (HMAC-signed, expiring).

## 5. Layout

```
server.js              Express app + all routes
src/config.js          event/contact/price/UPI config (.env driven)
src/db.js              Supabase + local-file storage adapter
src/ticket.js          ticket payload, QR code, .ics calendar
public/                index.html, ticket.html, admin.html, styles.css, *.js
public/fonts/          self-hosted webfonts (Poppins + Anek Tamil)
supabase/schema.sql    table, indexes, RLS, summary view
tests/smoke.mjs        63 end-to-end checks (npm test)
```

### Design

High-energy workshop landing in the be10x style: white / soft-grey bands, a single flame accent
(`--flame:#ff9933`), dark ink pricing and stat cards, rounded CTA buttons, benefit checklists and
fact chips (date / hours / live / duration), strikethrough ₹499 → ₹99 offer, review cards and an
FAQ — all bilingual English + Tamil. Type is self-hosted (Poppins body/display, Anek Tamil for the
Tamil copy). Icons are hand-drawn inline SVG; motion degrades gracefully with `prefers-reduced-motion`
and the ticket page prints cleanly.

## 6. Tests

```bash
npm test
```
Boots the real server and walks the whole flow: validation, idempotent registration, UPI reference
submission (short ref rejected), organiser Mark paid, meet-link + WhatsApp-group unlock, ticket QR,
calendar file, UPI notify by ticket code, admin auth, stats, CSV (with notes, no gateway columns),
check-in, refund, static pages (no Razorpay checkout), persistence.

## 7. Contact

WhatsApp / urgent call **+91 75503 21307** (Tamil) · **sanjaykumarvpk@gmail.com**
