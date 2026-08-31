/**
 * Storage layer.
 *
 * Two interchangeable backends behind one API:
 *   - Supabase  (production)  - set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - LocalFile (fallback)    - JSON on disk, so the app runs with zero setup
 *
 * Run `supabase/schema.sql` once in your Supabase project SQL editor first.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

const supabaseReady =
  !config.supabase.useLocal && Boolean(config.supabase.url) && Boolean(config.supabase.serviceKey);

let supabase = null;
if (supabaseReady) {
  try {
    supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err) {
    console.error('[DB] Supabase createClient failed:', err.message);
  }
}

export const backend = supabase ? 'supabase' : 'local';

/* ------------------------------------------------------------------ utils */

const uuid = () => crypto.randomUUID();

export function ticketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  let out = 'AIL-';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export const normalizePhone = (p = '') =>
  String(p).replace(/[^\d]/g, '').replace(/^0+/, '').slice(-10);

export const normalizeEmail = (e = '') => String(e).trim().toLowerCase();

/* Fields the admin search box looks in (kept identical for both backends). */
const SEARCH_FIELDS = ['email', 'phone', 'name', 'ticket_code', 'college', 'course'];

/** PostgREST `or=` filter. Commas/parens are PostgREST syntax, so strip them. */
function searchFilter(raw) {
  const s = String(raw).replace(/[(),%]/g, ' ').trim().slice(0, 60);
  return SEARCH_FIELDS.map((f) => `${f}.ilike.%${s}%`).join(',');
}

/* ---------------------------------------------------------- local backend */

class LocalFile {
  constructor(file) {
    this.file = file;
    this.memoryData = { registrations: [] };
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(this.memoryData, null, 2));
    } catch (err) {
      console.warn('[LocalFile] Filesystem write skipped (using memory):', err.message);
    }
  }
  read() {
    try {
      if (fs.existsSync(this.file)) {
        return JSON.parse(fs.readFileSync(this.file, 'utf8'));
      }
    } catch {
      // ignore
    }
    return this.memoryData;
  }
  write(data) {
    this.memoryData = data;
    try {
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.warn('[LocalFile] Write skipped:', err.message);
    }
  }
  async insert(row) {
    const data = this.read();
    data.registrations.unshift(row);
    this.write(data);
    return row;
  }
  async all() {
    return this.read().registrations;
  }
  async find(pred) {
    return this.read().registrations.find(pred) || null;
  }
  async update(id, patch) {
    const data = this.read();
    const row = data.registrations.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, patch);
    this.write(data);
    return row;
  }
}

const local = new LocalFile(config.supabase.localFile);

/* ------------------------------------------------------------------- API */

function blankRow() {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    ticket_code: ticketCode(),
    name: '',
    email: '',
    phone: '',
    college: '',
    course: '',
    year: '',
    status: 'pending', // pending | paid | failed | refunded
    amount_paise: 0,
    currency: config.event.currency,
    paid_at: null,
    attended: false,
    check_in_at: null,
    notes: null,
    source: 'website',
    created_at: now,
    updated_at: now,
  };
}

export async function createRegistration(input) {
  const row = { ...blankRow(), ...input, updated_at: new Date().toISOString() };
  if (supabase) {
    const { data, error } = await supabase.from(config.supabase.table).insert(row).select().single();
    if (error) throw new Error(`Supabase insert failed: ${error.message}`);
    return data;
  }
  return local.insert(row);
}

export async function getById(id) {
  if (supabase) {
    const { data, error } = await supabase.from(config.supabase.table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return data;
  }
  return local.find((r) => r.id === id);
}

export async function getByTicketCode(code) {
  if (supabase) {
    const { data, error } = await supabase
      .from(config.supabase.table)
      .select('*')
      .eq('ticket_code', String(code).toUpperCase())
      .maybeSingle();
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return data;
  }
  return local.find((r) => r.ticket_code === String(code).toUpperCase());
}

export async function getByEmail(email) {
  const mail = normalizeEmail(email);
  if (supabase) {
    const { data, error } = await supabase
      .from(config.supabase.table)
      .select('*')
      .eq('email', mail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return data;
  }
  return local.find((r) => r.email === mail);
}

export async function updateRegistration(id, patch) {
  const body = { ...patch, updated_at: new Date().toISOString() };
  if (supabase) {
    const { data, error } = await supabase
      .from(config.supabase.table)
      .update(body)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Supabase update failed: ${error.message}`);
    return data;
  }
  return local.update(id, body);
}

export async function listRegistrations({ status, search, limit = 1000 } = {}) {
  if (supabase) {
    let q = supabase.from(config.supabase.table).select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (search) q = q.or(searchFilter(search));
    q = q.limit(limit);
    const { data, error } = await q;
    if (error) throw new Error(`Supabase list failed: ${error.message}`);
    return data || [];
  }
  let rows = await local.all();
  if (status) rows = rows.filter((r) => r.status === status);
  if (search) {
    const s = String(search).toLowerCase();
    rows = rows.filter((r) => SEARCH_FIELDS.some((f) => String(r[f] || '').toLowerCase().includes(s)));
  }
  return rows.slice(0, limit);
}

export async function stats() {
  const rows = await listRegistrations({ limit: 50000 });
  const paid = rows.filter((r) => r.status === 'paid');
  const revenue = paid.reduce((s, r) => s + Number(r.amount_paise || 0), 0);
  const byDay = {};
  for (const r of rows) {
    const d = String(r.created_at || '').slice(0, 10);
    if (!d) continue;
    byDay[d] = byDay[d] || { date: d, registrations: 0, paid: 0, revenue_paise: 0 };
    byDay[d].registrations += 1;
    if (r.status === 'paid') {
      byDay[d].paid += 1;
      byDay[d].revenue_paise += Number(r.amount_paise || 0);
    }
  }
  return {
    total: rows.length,
    paid: paid.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    refunded: rows.filter((r) => r.status === 'refunded').length,
    attended: rows.filter((r) => r.attended).length,
    revenue_paise: revenue,
    conversion_pct: rows.length ? Math.round((paid.length / rows.length) * 1000) / 10 : 0,
    by_day: Object.values(byDay).sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}
