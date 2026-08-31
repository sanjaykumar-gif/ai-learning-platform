/**
 * Ticket helpers: printable ticket payload, QR code (data URI), calendar file.
 */
import QRCode from 'qrcode';
import { config } from './config.js';

const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: config.event.timezone,
  }).format(d);
};

export function ticketUrl(row, baseUrl) {
  const base = baseUrl || config.server.publicBaseUrl || '';
  return `${base}/ticket.html?code=${row.ticket_code}`;
}

export async function qrDataUri(text) {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#14121f', light: '#ffffff' },
  });
}

export function publicTicket(row, baseUrl) {
  const paid = row.status === 'paid';
  const e = config.event;
  return {
    ticket_code: row.ticket_code,
    name: row.name,
    email: row.email,
    phone: row.phone,
    college: row.college,
    course: row.course,
    year: row.year,
    status: row.status,
    amount_paise: row.amount_paise,
    amount_display: `${(Number(row.amount_paise || 0) / 100).toFixed(0)}`,
    paid_at: row.paid_at,
    issued_at: row.created_at,
    event: {
      title: e.title,
      starts_at: e.startsAt,
      starts_at_display: fmtDateTime(e.startsAt),
      duration_minutes: e.durationMinutes,
      timezone: e.timezone,
      meet_link: paid ? e.meetLink : '', // reveal only after payment
      whatsapp_group_link: paid ? e.whatsappGroupLink : '',
      drive_folder_link: paid ? e.driveFolderLink : '',
    },
    organizer: config.contact,
  };
}

export function icsFor(row) {
  const start = new Date(config.event.startsAt);
  const end = new Date(start.getTime() + config.event.durationMinutes * 60000);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const paid = row.status === 'paid';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AI Learning Share//Masterclass//EN',
    'BEGIN:VEVENT',
    `UID:${row.ticket_code}@ai-learning-share`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${config.event.calendarTitle}`,
    `DESCRIPTION:Ticket ${row.ticket_code} — ${row.name}${paid ? `\nGoogle Meet: ${config.event.meetLink}` : '\nPayment pending.'}`,
    'LOCATION:Google Meet',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:AI Masterclass starts in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
