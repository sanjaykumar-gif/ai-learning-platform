/**
 * Central configuration.
 * Anything an organiser changes between events lives in this file.
 * Secrets come from environment variables (.env) - never hardcode them here.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const bool = (v, d = false) => (v === undefined ? d : /^(1|true|yes)$/i.test(String(v)));
const int = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : d);

export const config = {
  // ---------------------------------------------------------------- event ---
  event: {
    title: 'AI Learning Share — Live Google Meet Masterclass',
    titleTamil: 'AI கற்றல் பகிர்வு — நேரலை கூகிள் மீட் மாஸ்டர்கிளாஸ்',
    tagline:
      'Agent Mode, Antigravity, Google AI Studio, Prompt Engineering + GUVI certificate roadmap — one 3-hour live session on Google Meet.',
    taglineTamil:
      'Agent Mode, Antigravity, Google AI Studio, Prompt Engineering + GUVI சான்றிதழ் வழிகாட்டி — கூகிள் மீட்டில் 3 மணி நேர நேரலை பயிற்சி.',

    // >>> CHANGE THESE FOR YOUR EVENT <<<
    startsAt: process.env.EVENT_STARTS_AT || '2026-09-05T19:00:00+05:30', // ISO 8601 with IST offset
    durationMinutes: int(process.env.EVENT_DURATION_MIN, 180),
    timezone: 'Asia/Kolkata',
    meetLink: process.env.GOOGLE_MEET_LINK || '', // e.g. https://meet.google.com/abc-defg-hij
    calendarTitle: process.env.CALENDAR_TITLE || 'AI Learning Share — Live Masterclass',

    // Ticket price in rupees (whole number). Stored in the DB as paise.
    priceRupees: int(process.env.EVENT_PRICE_RUPEES, 99),
    currency: process.env.EVENT_CURRENCY || 'INR',
    earlyBirdRupees: int(process.env.EVENT_EARLYBIRD_RUPEES, 0), // 0 = no early bird
    earlyBirdEndsAt: process.env.EARLYBIRD_ENDS_AT || '',

    seatsTotal: int(process.env.EVENT_SEATS, 0), // 0 = unlimited
    registrationClosesAt: process.env.REGISTRATION_CLOSES_AT || '', // ISO, '' = no cut-off

    // Shown only on the ticket of a PAID participant.
    whatsappGroupLink: process.env.WHATSAPP_GROUP_LINK || '',
    driveFolderLink: process.env.DRIVE_FOLDER_LINK || '',
  },

  // -------------------------------------------------------------- contact ---
  contact: {
    whatsappNumber: process.env.WHATSAPP_NUMBER || '917550321307', // international format, no +
    urgentCallNumber: process.env.URGENT_CALL_NUMBER || '917550321307',
    email: process.env.CONTACT_EMAIL || 'sanjaykumarvpk@gmail.com',
    preferredLanguage: 'Tamil / தமிழ்',
    organizerName: process.env.ORGANIZER_NAME || 'Sanjay Kumar V P K',
    // Direct-UPI payments (no gateway). e.g. 7550321307@ybl — leave empty to hide this option.
    // Comma-separate several IDs to offer a choice:  id1@ybl,id2@oksbi
    upiId: process.env.UPI_ID || '',
    upiIds: (process.env.UPI_ID || '').split(',').map((s) => s.trim()).filter(Boolean),
  },

  // -------------------------------------------------------------- supabase ---
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    table: process.env.SUPABASE_TABLE || 'registrations',
    // When true (or when URL/key are missing) registrations are kept in a local
    // JSON file so the site still runs before Supabase is connected.
    useLocal: bool(process.env.USE_LOCAL_DB, false),
    localFile: process.env.LOCAL_DB_FILE || (process.env.VERCEL ? '/tmp/db.json' : fileURLToPath(new URL('../data/db.json', import.meta.url))),
  },

  // ----------------------------------------------------------------- admin ---
  admin: {
    password: process.env.ADMIN_PASSWORD || 'ChangeMe@123',
    sessionSecret: process.env.SERVER_SECRET || 'dev-secret-change-me',
    sessionHours: int(process.env.ADMIN_SESSION_HOURS, 12),
  },

  server: {
    port: int(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '', // used to build ticket URLs
  },

  brand: {
    accent: process.env.BRAND_ACCENT || '#7C5CFF',
    accent2: process.env.BRAND_ACCENT_2 || '#00D1B2',
  },
};

export const pricePaise = () => {
  const now = Date.now();
  const eb = config.event.earlyBirdRupees;
  if (eb > 0 && config.event.earlyBirdEndsAt && now < new Date(config.event.earlyBirdEndsAt).getTime()) {
    return eb * 100;
  }
  return config.event.priceRupees * 100;
};

export const isRegistrationOpen = () => {
  if (!config.event.registrationClosesAt) return true;
  return Date.now() < new Date(config.event.registrationClosesAt).getTime();
};
