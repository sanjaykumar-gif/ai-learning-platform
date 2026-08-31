# ⚠️ PENDING WORKS — MANUAL / நீங்கள் செய்ய வேண்டியவை

இந்த website-ஐ நான் build செய்து, **63 automated checks pass** ஆகிவிட்டது.
ஆனால் கீழே இருப்பவை **உங்களால் மட்டுமே செய்ய முடியும்** (accounts, keys, links உங்களிடம் தான் இருக்கு).

Legend: 🔴 must do before collecting money · 🟡 do before the event · 🟢 optional / nice to have

---

## ✅ 1. Payments — Razorpay REMOVED, Direct UPI is the only method

Razorpay முழுவதும் code-ல இருந்து நீக்கப்பட்டுவிட்டது (no gateway, no KYC, no webhook, no card details).
Payment = **Direct UPI**: buyer உங்கள் UPI id-க்கு (`UPI_ID` in `.env`) GPay/PhonePe/Paytm-ல் பணம் அனுப்புகிறார்,
reference number-ஐ paste செய்கிறார்; நீங்கள் dashboard-ல் **Mark paid** அழுத்தினால் ticket unlock ஆகும்.

உங்கள் பக்கம் மட்டும்:
1. `.env`-ல் `UPI_ID` சரியாக இருக்கிறது என்று confirm பண்ணுங்க (`sanjaykumarvpk@oksbi`).
2. ஒவ்வொரு UPI ref-ஐயும் உங்கள் UPI app-ல் amount சரியா வந்துள்ளதா என பார்த்து பிறகு **Mark paid** செய்யுங்க.

## 🔴 2. Supabase (database)

**Why:** இப்போது data `data/db.json` (local file)-ல தான் இருக்கு. Server restart/deploy ஆனா data போயிடும்.

1. https://supabase.com → **New project** (region: `South Asia (Mumbai)`).
2. **SQL Editor → New query** → `supabase/schema.sql` முழுசா paste → **Run**.
3. **Project Settings → API** → copy:
   ```
   SUPABASE_URL=https://xxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...   # service_role key, NOT the anon key
   USE_LOCAL_DB=false
   ```
4. `npm start` → log-ல `DB backend : supabase` வரணும்.
5. Supabase → Table Editor → `registrations` table-ல rows வருதா என்று confirm பண்ணுங்க.

⚠️ `service_role` key-ஐ **browser-ல எங்கயும்** put பண்ணாதீங்க. `.env` server-ல மட்டும்.
⚠️ Free plan-ல 7 நாள் inactive ஆனா project pause ஆகும் — event-க்கு முன்னாடி ஒரு தடவை login பண்ணுங்க.

## 🟡 3. Google Meet link

1. meet.google.com → **New meeting → Create a meeting for later** (அல்லது Google Calendar event create பண்ணி meet link எடுங்க).
2. `.env`-ல: `GOOGLE_MEET_LINK=https://meet.google.com/xxx-xxxx-xxx`
3. ⚠️ Meet link **paid participant ticket-ல மட்டும் தான்** தெரியும் (ஏற்கனவே code-ல implement ஆகிடுச்சு).
4. Meet settings: **"Host approval to join"** on பண்ணுங்க → ticket code check பண்ணி admit பண்ணலாம்.
5. ✅ Fake placeholder நீக்கப்பட்டது — link set பண்ணும் வரை ticket-ல் "Meet link not set yet — check WhatsApp" என்று honest-ஆ காட்டும்.

## ✅ 4. WhatsApp group — LINK LIVE

✅ `WHATSAPP_GROUP_LINK=https://chat.whatsapp.com/FpuPLYHSyUn0jzFFTKr1iE` set ஆகிவிட்டது.
Paid ஆன உடனே ticket page-ல green **"Join the WhatsApp group"** button வரும் (browser-ல் verify ஆகிவிட்டது).
இனி உங்கள் பக்கம் மட்டும்:

1. Group settings-ல் **"Only admins can send messages"** + **"Only admins can edit group info"** வைச்சுக்கோங்க (spam தவிர்க்க).
2. Group name suggestion: `AI Masterclass — Batch 1`.

## 🟡 5. Study materials (Drive folder)

1. Google Drive → New folder → "Share → Anyone with the link → Viewer".
2. `.env`-ல: `DRIVE_FOLDER_LINK=https://drive.google.com/drive/folders/XXXX`
3. Session recording, slides, prompt pack, certificate — எல்லாம் இங்க தான் upload பண்ணணும்.
4. ✅ Placeholder நீக்கப்பட்டது — folder set பண்ணும் வரை "Materials folder" button ticket-ல் காட்டவே மாட்டாது.

## 🟡 6. Event details confirm பண்ணுங்க

`.env`-ல இவை இப்போ **placeholder** ஆ இருக்கு — மாத்தணும்:
```
EVENT_STARTS_AT=2026-09-05T19:00:00+05:30   # ← உண்மையான date/time (IST)
EVENT_PRICE_RUPEES=99                        # ← உண்மையான price
EVENT_DURATION_MIN=180
```
Optional: `EVENT_EARLYBIRD_RUPEES` + `EARLYBIRD_ENDS_AT` (early bird offer),
`EVENT_SEATS`, `REGISTRATION_CLOSES_AT`.

## 🟡 7. Admin dashboard security

```
ADMIN_PASSWORD=உங்க-strong-password          # இப்போ set பண்ணது: share#12345 — public deploy-க்கு இன்னும் strong ஆக வைக்கலாம்
SERVER_SECRET=<64-char random string>        # `openssl rand -hex 32`
```
Dashboard: `/admin.html`. இதுல பார்க்கலாம்: எத்தனை பேர் register, **எத்தனை பேர் paid**, revenue,
conversion %, daily chart, ஒவ்வொரு attendee-ோட data, check-in, CSV export.

## 🟡 8. Deploy + domain + HTTPS

**Render (free, easiest):**
1. Code-ஐ GitHub-ல push பண்ணுங்க.
2. render.com → New → **Web Service** → repo select → Build: `npm install`, Start: `npm start`.
3. Environment → `.env` values-ஐ add பண்ணுங்க.
4. Settings → `PUBLIC_BASE_URL=https://your-app.onrender.com` ← **QR code-க்கு இது முக்கியம்**.

**VPS (DigitalOcean/AWS):** `pm2 start server.js --name ai-meet` + Nginx + Let's Encrypt SSL.

## 🔴 9. Go-live checklist (UPI flow)

- [ ] Full flow test: register → UPI QR / "Open my UPI app" → ref paste → dashboard-ல் Mark paid → ticket unlock
- [ ] Admin dashboard-ல் `paid` count + revenue சரியா வருது
- [ ] Ticket page QR scan பண்ணா ticket page-ே open ஆகுது
- [ ] Paid ticket-ல் WhatsApp group + (set பண்ணியிருந்தா) Meet link தெரியுது
- [ ] `UPI_ID` உங்கள் UPI app-ல் ₹199 prefill ஆகுது
- [ ] `ADMIN_PASSWORD` மாத்தப்பட்டது (default வேண்டாம்)

---

## 🟡 10. UPI ID — verify yours (Direct UPI payment is ON)

**Why:** Razorpay இல்லாமலே payment வாங்க "Pay with any UPI app" option integrate பண்ணியிருக்கேன்.
Buyer QR scan செய்வார் / UPI app open செய்வார் → ₹199 உங்கள் account-க்கு → reference number paste செய்வார் →
நீங்க dashboard-ல **Mark paid** அழுத்தினா ticket unlock ஆகும்.

1. `.env`-ல `UPI_ID=sanjaykumarvpk@oksbi` இருக்கு — **இது உங்கள் UPI ID தானா என்று UPI app-ல check செய்யுங்க.**
   Handle வேறையா இருந்தா மாத்துங்க: `@ybl` (PhonePe), `@oksbi` (SBI), `@okaxis` (Axis),
   `@okhdfcbank` (HDFC), `@okicici` (ICICI), `@paytm`.
2. Test: site-ல "Open my UPI app" அழுத்தி → உங்கள் UPI app-ல ₹199 prefill ஆகுதா என்று பாருங்க.
3. Buyer reference அனுப்பின பிறகு dashboard table-ல அந்த ref தெரியும்; bank app-ல amount match ஆனா **Mark paid**.
4. UPI option வேண்டாம்-னா `UPI_ID=` (காலி) விடுங்க — அந்த box மறைந்துவிடும்.

## 🟢 இன்னும் build ஆகாதவை (features you may want next)

இவை code-ல **இல்லை** — தேவைப்பட்டா சொல்லுங்க, add பண்றேன்:

| Feature | Status | Note |
|---|---|---|
| **Email confirmation + ticket attachment** | ❌ Not built | இப்போ ticket page + WhatsApp மட்டும். Resend/Brevo/SMTP add பண்ணணும் |
| **PDF certificate generation** | ❌ Not built | Landing page-ல "e-certificate" promise பண்ணிருக்கோம் → session முடிஞ்சதும் generate பண்ணணும் |
| **WhatsApp automated message (API)** | ⚠️ Manual | இப்போ "open WhatsApp" link மட்டும். Automatic-ஆ அனுப்ப WhatsApp Business Cloud API / Twilio வேணும் |
| **Coupon / discount codes** | ❌ Not built | Early bird மட்டும் இருக்கு |
| **Refund automation** | ⚠️ Manual | UPI app-ல manual refund + admin dashboard-ல status "refunded" mark பண்ணணும் |
| **Multi-batch / multiple events** | ❌ Not built | இப்போ ஒரு event-க்கு மட்டும் config |
| **Recording auto-share** | ⚠️ Manual | Meet recording → Drive → group-ல share |
| **Google Analytics / Meta pixel** | ❌ Not built | Ad run பண்ண போறீங்க-னா add பண்ணணும் |
| **Refund policy / Terms / Privacy page** | ❌ Not built | நம்பிக்கைக்கு இது முக்கியம் — ஒரு page create பண்ணணும் |
| **Tamil/English language toggle** | ⚠️ Mixed | Landing-ல Tamil + English ரெண்டும் இருக்கு, full toggle இல்லை |

---

## 📞 Support

ஏதாவது problem-னா:
- **WhatsApp (text):** +91 75503 21307 — தமிழில் message பண்ணுங்க
- **Urgent call:** +91 75503 21307
- **Email:** sanjaykumarvpk@gmail.com
