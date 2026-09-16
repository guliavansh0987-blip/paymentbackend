// services/imapService.js
//
// Node.js drop-in replacement for verify_status.php and history.php.
// Uses imap-simple + mailparser (already in package.json — no new deps needed).
//
// Two exported functions:
//   getHistory(email, pass, limit)    → replaces history.php
//   verifyStatus({ utr, email, pass,  → replaces verify_status.php
//                  amount, mode,
//                  orderId, since })
//
// Called directly (in-process, no HTTP round-trip) by fampayService.js
// and fampayController.js, and exposed as public REST endpoints in
// routes/imap.js for checkout.html's payment-status polling.
//
// ⚠️  VERCEL TIMEOUT WARNING: Gmail IMAP connections can be slow (3-8s).
//     Vercel Hobby plan has a 10-second function timeout. If you see
//     frequent timeouts, upgrade to Vercel Pro (60s timeout) or switch to
//     Vercel's Fluid Compute feature.

const imaps          = require('imap-simple');
const { simpleParser } = require('mailparser');
const logger         = require('../utils/logger');

// ─── IMAP base config (Gmail only) ───────────────────────────────────────────
const IMAP_BASE = {
  host:        'imap.gmail.com',
  port:        993,
  tls:         true,
  tlsOptions:  { rejectUnauthorized: false },
  connTimeout: 9000,   // 9s — stay under Vercel's 10s limit
  authTimeout: 9000,
};

// ─── Regex patterns — ported exactly from history.php / verify_status.php ────
const RE_AMOUNT      = /received\s+(?:₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)/ui;
const RE_AMT_SUBJECT = /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/u;
const RE_UTR         = /UTR[:\s]+(\d+)/i;
const RE_TXN_ID      = /transaction\s+id\s+([A-Z0-9]+)/i;
const RE_SENDER      = /from\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)\s+at\s+\d/ui;
const RE_UPI_PAREN   = /from\s+[A-Za-z][A-Za-z0-9\s]{1,40}?\s*\(([a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,15})\)/ui;
const RE_UPI_LABEL   = /UPI\s*ID[:\s]+([a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,15})/i;
const RE_BALANCE     = /balance\s+is\s+(?:₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)/ui;
const RE_TXN_TIME    = /at\s+(\d{1,2}:\d{2}\s*[AP]M\s*IST,?\s*\d{1,2}\s+\w+\s+\d{4})/i;
const RE_PURPOSE     = /Purpose[:\s]+(.+?)(?:\.|$)/im;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFloatClean(s) {
  return parseFloat(String(s || '').replace(/,/g, '')) || 0;
}

/**
 * "12:30 PM IST, 06 August 2026"  →  "06-08-2026 12:30:00"
 * Mirrors history.php's $finalDatetime logic.
 */
const MONTHS = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
};

function formatTxnTime(str, fallbackDate) {
  if (str) {
    const clean = str.replace(/\s*IST\s*/i, ' ').trim();
    const m = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM),?\s*(\d{1,2})\s+(\w+)\s+(\d{4})$/i);
    if (m) {
      let [, h, min, ap, d, mon, y] = m;
      h = parseInt(h, 10); min = parseInt(min, 10);
      d = parseInt(d, 10);  y = parseInt(y, 10);
      const mo = MONTHS[mon.toLowerCase()] || 0;
      if (mo) {
        if (ap.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ap.toUpperCase() === 'AM' && h === 12) h = 0;
        return `${String(d).padStart(2,'0')}-${String(mo).padStart(2,'0')}-${y} ` +
               `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`;
      }
    }
  }
  if (fallbackDate instanceof Date && !isNaN(fallbackDate)) {
    const d = fallbackDate;
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ` +
           `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:00`;
  }
  return 'NA';
}

/**
 * Exported helper — fampayService.js already uses this to compare transaction
 * timestamps against order creation times. Kept compatible with the old
 * parseTxnDatetime() that existed inline in fampayService.js.
 * Input:  "dd-mm-yyyy HH:ii:ss" (what formatTxnTime produces)
 * Output: milliseconds since epoch, or null
 */
function parseTxnDatetime(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`).getTime();
}

/**
 * parseBody — extract all transaction fields from a plain-text email body.
 * Returns an object with both the raw internal fields AND the history.php-
 * compatible shape (same keys fampayService.js reads).
 */
function parseBody(body, subject, emailDate) {
  const amtM    = RE_AMOUNT.exec(body);
  const amount  = amtM ? parseFloatClean(amtM[1]) : null;

  const amtFallback = (() => {
    if (amount !== null) return null;
    const sm = RE_AMT_SUBJECT.exec(subject || '');
    return sm ? parseFloatClean(sm[1]) : null;
  })();

  const utrM    = RE_UTR.exec(body);
  const txnM    = RE_TXN_ID.exec(body);
  const senderM = RE_SENDER.exec(body);
  const upiM1   = RE_UPI_PAREN.exec(body);
  const upiM2   = upiM1 ? null : RE_UPI_LABEL.exec(body);
  const balM    = RE_BALANCE.exec(body);
  const timeM   = RE_TXN_TIME.exec(body);
  const purpM   = RE_PURPOSE.exec(body);

  const rawUtr   = utrM   ? utrM[1]              : null;
  const rawTxnId = txnM   ? txnM[1]              : null;
  const sender   = senderM ? senderM[1].trim()    : null;
  const upiId    = upiM1  ? upiM1[1]
                 : upiM2  ? upiM2[1]              : null;
  const balance  = balM   ? parseFloatClean(balM[1]) : null;
  const rawTime  = timeM  ? timeM[1].trim()       : null;

  const finalAmount   = amount ?? amtFallback;
  const displayRef    = rawUtr || rawTxnId || 'NA';
  const refType       = rawUtr ? 'utr' : (rawTxnId ? 'txn' : 'none');
  const datetime      = formatTxnTime(rawTime, emailDate);
  const purposeStr    = purpM ? purpM[1].trim() : 'NA';

  return {
    // ── Internal identifiers (used by verifyStatus matching logic) ──
    _rawUtr:   rawUtr,
    _rawTxnId: rawTxnId,
    _amount:   finalAmount,

    // ── history.php-compatible output (read by fampayService.js) ────
    name:     sender    || 'NA',
    upi_id:   upiId     || 'NA',
    utr:      displayRef,
    ref_type: refType,
    datetime,
    amount:   finalAmount,
    purpose:  purposeStr,
    txn_id:   rawTxnId  || 'NA',
    balance,
  };
}

// ─── Core IMAP connect + fetch ────────────────────────────────────────────────

async function connectAndFetch(email, pass, limit) {
  const connection = await imaps.connect({
    imap: { ...IMAP_BASE, user: email, password: pass },
  });

  let messages;
  try {
    await connection.openBox('INBOX');

    const searchCriteria = [['SUBJECT', 'FamX account']];
    const fetchOptions   = {
      bodies:   [''],       // full RFC822 message — simpleParser handles encoding
      struct:   false,
      markSeen: false,
    };

    messages = await connection.search(searchCriteria, fetchOptions);

    // Sort newest-first (mirrors PHP's rsort + array_slice)
    messages.sort((a, b) => {
      const da = a.attributes?.date ? new Date(a.attributes.date).getTime() : 0;
      const db = b.attributes?.date ? new Date(b.attributes.date).getTime() : 0;
      return db - da;
    });

    messages = messages.slice(0, Math.min(limit, 100));
  } catch (err) {
    try { connection.end(); } catch (_) {}
    throw err;
  }

  return { connection, messages };
}

// ─── Friendly IMAP error messages (mirrors history.php) ──────────────────────

function friendlyError(msg = '') {
  if (/AUTHENTICATIONFAILED|Too many login failures/i.test(msg))
    return 'Invalid App Password. Please generate a new App Password and try again.';
  if (/Connection refused/i.test(msg))
    return 'Connection refused. Please check your internet or firewall settings.';
  if (/certificate/i.test(msg))
    return 'SSL certificate error. Please check your server settings.';
  return msg || 'Connection failed. Please check your credentials.';
}

// ─── Exported: getHistory ─────────────────────────────────────────────────────
/**
 * Replacement for history.php.
 * Returns { status: true, error: null, data: [...] }
 *      or { status: false, error: 'friendly msg', raw_error: '...', data: [] }
 */
async function getHistory(email, pass, limit = 20) {
  if (!email || !pass) {
    return { status: false, error: 'email and pass params are required.', data: [] };
  }
  if (limit <= 0)  limit = 20;
  if (limit > 100) limit = 100;

  let connection;
  try {
    const fetched = await connectAndFetch(email, pass, limit);
    connection    = fetched.connection;

    const data = [];
    for (const msg of fetched.messages) {
      const rawPart = msg.parts.find(p => p.which === '');
      if (!rawPart?.body) continue;
      try {
        const parsed = await simpleParser(rawPart.body);
        const body   = parsed.text || '';
        const row    = parseBody(body, parsed.subject || '', parsed.date);
        if (row.amount !== null && row.amount > 0) data.push(row);
      } catch (e) {
        logger.warn('imapService.getHistory: skipped unparseable email:', e.message);
      }
    }

    return { status: true, error: null, data };
  } catch (err) {
    logger.error('imapService.getHistory error:', err.message);
    return {
      status:    false,
      error:     friendlyError(err.message),
      raw_error: err.message,
      data:      [],
    };
  } finally {
    if (connection) try { connection.end(); } catch (_) {}
  }
}

// ─── Exported: verifyStatus ───────────────────────────────────────────────────
/**
 * Replacement for verify_status.php.
 *
 * @param {object} params
 * @param {string}  params.utr       - the "utr" query param (backward compat key; can be typed UTR)
 * @param {string}  params.email     - Gmail address
 * @param {string}  params.pass      - Gmail App Password
 * @param {number}  [params.amount]  - expected amount (auto-poll mode)
 * @param {string}  [params.mode]    - 'order' (match by amount) | 'utr' (match by typed UTR)
 * @param {string}  [params.orderId] - real order id (for response + dup-guard)
 * @param {number}  [params.since]   - unix timestamp (seconds) of order creation
 */
async function verifyStatus({ utr: utrParam, email, pass, amount: expectedAmt, mode = 'order', orderId, since }) {
  if (!utrParam || !email || !pass) {
    return { success: false, message: 'Order ID, Email and Password required.' };
  }

  // Strip spaces from app password (mirrors PHP's str_replace(' ', '', ...))
  pass = String(pass).replace(/\s/g, '');

  let connection;
  try {
    const fetched = await connectAndFetch(email, pass, 30);
    connection    = fetched.connection;

    for (const msg of fetched.messages) {
      const rawPart = msg.parts.find(p => p.which === '');
      if (!rawPart?.body) continue;

      let parsed;
      try { parsed = await simpleParser(rawPart.body); }
      catch { continue; }

      const emailTs = parsed.date ? parsed.date.getTime() : null;

      // Reject emails older than the order (mode=order only); 90s clock-skew buffer
      if (mode !== 'utr' && since != null) {
        const sinceMs = parseInt(since, 10) * 1000;
        if (!emailTs || emailTs < sinceMs - 90000) continue;
      }

      const body = parsed.text || '';
      const txn  = parseBody(body, parsed.subject || '', parsed.date);

      if (!txn._amount) continue;

      // Identifier used for matching
      const identifier = txn._rawUtr || txn._rawTxnId;
      if (!identifier) continue;

      if (mode === 'utr') {
        // Manual: typed UTR must appear as extracted value OR raw body substring
        const matches = (txn._rawUtr === utrParam) ||
                        (txn._rawTxnId === utrParam) ||
                        body.includes(utrParam);
        if (!matches) continue;
      } else {
        // Auto-poll: match by amount
        if (expectedAmt != null && Math.abs(txn._amount - parseFloat(expectedAmt)) > 0.009) continue;
      }

      return {
        success:     true,
        status:      'PAID',
        order_id:    orderId || utrParam,
        utr:         identifier,
        amount:      txn._amount,
        sender:      txn.name !== 'NA' ? txn.name : 'Unknown',
        datetime:    txn.datetime,
        raw_subject: parsed.subject || '',
      };
    }

    return { success: false, status: 'PENDING', message: 'Transaction not found yet' };

  } catch (err) {
    logger.error('imapService.verifyStatus error:', err.message);
    return { success: false, message: 'IMAP Auth Failed', raw_error: friendlyError(err.message) };
  } finally {
    if (connection) try { connection.end(); } catch (_) {}
  }
}

module.exports = { getHistory, verifyStatus, parseTxnDatetime };
