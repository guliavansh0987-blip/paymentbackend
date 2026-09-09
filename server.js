// server.js - ZapPay Backend
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');

const logger = require('./utils/logger');

// Initialize Firebase — errors are logged but don't crash the server
const { initializeFirebase } = require('./firebase/admin');
initializeFirebase();

// ── One-time seed of default data (idempotent — skips anything that
// already exists) ──
// IMPORTANT: this must run at MODULE LOAD TIME, not as request middleware.
// It previously ran as an app.use() middleware registered AFTER the 404/
// error handlers below — which made it structurally unreachable: any
// matched API route sends its own response and ends the cycle before
// ever reaching it, and any unmatched route hits notFoundHandler (also
// registered earlier) first. Net effect: it never ran in production at
// all, which is why WELCM5 (added to DEFAULT_PROMO_CODES after the last
// local dev run) was never actually written to the database.
(async () => {
  try {
    const { seedDefaultPlans } = require('./services/subscriptionService');
    await seedDefaultPlans();
    const { seedDefaultPromoCodes } = require('./services/promoService');
    await seedDefaultPromoCodes();
    logger.info('✅ Default plans & promo codes seed check complete');
  } catch (e) {
    logger.error('Seed error: ' + e.message);
  }
})();

const app = express();

// Vercel's edge network sits in front of this function and adds exactly one
// X-Forwarded-For hop before invoking it. Without telling Express to trust
// that one hop, express-rate-limit (used below) sees the X-Forwarded-For
// header, considers it untrusted, and THROWS a ValidationError on every
// single /api/* request — which crashes the whole serverless function
// (500 FUNCTION_INVOCATION_FAILED). This must be set before the rate
// limiter middleware is registered.
app.set('trust proxy', 1);

// Security
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

// CORS
// Normalize origins (strip trailing slash, lowercase) so a Vercel env var
// like "https://zappay.page.gd/" still matches the browser's actual
// Origin header "https://zappay.page.gd" (browsers never send a trailing
// slash). A mismatch here causes fetch() to fail with a generic, unhelpful
// "Failed to fetch" — the browser hides the real CORS reason from JS.
const normalizeOrigin = (o) => (o || '').trim().toLowerCase().replace(/\/+$/, '');
// "www.zappay.shop" and "zappay.shop" are the same site to a visitor, but
// FRONTEND_URL only ever holds one spelling — whichever one a browser's
// Origin header doesn't match gets silently CORS-rejected, which is what
// broke the site when Google indexed/linked the www version but
// FRONTEND_URL only listed the bare domain. Stripping "www." from both
// sides before comparing makes either spelling work regardless of which
// one is actually configured.
const stripWww = (o) => o.replace(/^(https?:\/\/)www\./, '$1');
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(normalizeOrigin)
  : ['*'];

const dashboardCors = cors({
  origin: (origin, cb) => {
    const normalizedOrigin = normalizeOrigin(origin);
    const isAllowed = !origin
      || allowedOrigins.includes('*')
      || allowedOrigins.includes(normalizedOrigin)
      || allowedOrigins.some((a) => stripWww(a) === stripWww(normalizedOrigin));
    if (isAllowed) {
      cb(null, true);
    } else {
      logger.warn(`CORS rejected origin: "${origin}" — allowed: ${JSON.stringify(allowedOrigins)}`);
      cb(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});

// ZapAPI (Developer Portal) routes are called directly from a MERCHANT'S
// OWN website/app/server — any origin, not just our own frontend — so
// they get their own fully-open CORS instead of the dashboard's origin
// allowlist. No cookies/credentials ride on this door (auth is the
// zap_api key itself, checked inside the route), so opening the origin
// here doesn't widen the dashboard's own attack surface.
//
// NOTE: only the merchant-key-authenticated endpoints (create-order,
// order-status) belong on this open door. /api/developer/token and
// /token/regenerate are called by OUR OWN dashboard (index.html) using
// the user's JWT in an `Authorization` header — they must go through
// dashboardCors instead, because developerCors's allowedHeaders list
// below doesn't include `Authorization`. Routing them through
// developerCors made the browser's CORS preflight for GET
// /api/developer/token fail (Authorization not allowed), which surfaced
// in the UI as a generic "Network error: Could not connect to the
// backend server" on the Developer Portal page.
const developerCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-ZapAPI-Key'],
});

// /api/gateway-test/* (the test.html simulator's own endpoints) belongs on
// this same open door and for the same reason: test.html can end up
// deployed on either the root domain or the panel subdomain (it's mirrored
// to both — see /test.html), and like create-order/order-status it carries
// no cookies/credentials, so opening its origin doesn't widen the
// dashboard's own attack surface either.
const OPEN_CORS_PATHS = [
  /^\/api\/developer\/create-order/,
  /^\/api\/developer\/order-status\//,
  /^\/api\/developer\/public-order-status\//,
  /^\/api\/gateway-test\//,
  // Store Portal storefront (root/store/index.html) now lives on the root
  // domain (zappay.shop), not the panel subdomain FRONTEND_URL points at.
  // Same reasoning as gateway-test above: public, no auth, no cookies —
  // opening the origin here doesn't widen the dashboard's own attack
  // surface, and it means the storefront keeps working regardless of what
  // FRONTEND_URL is set to.
  /^\/api\/store-public\//,
  // test.html (root domain, /test.html) calls these directly with no login
  // and no cookies — same reasoning as store-public/gateway-test above.
  // Abuse is bounded by otpSendLimiter/otpVerifyLimiter (per email+IP)
  // rather than by CORS, since CORS only stops *browsers*, not scripts.
  /^\/api\/otp\//,
  // checkout.html (root domain, /checkout.html) polls order status and
  // posts manual UTR verification directly — same situation as
  // store-public/gateway-test/otp above: public, no login, no cookies,
  // and it needs to work regardless of what FRONTEND_URL is set to since
  // checkout.html is served from zappay.shop, not the panel subdomain.
  // Without this, every fetch() from checkout.html to these two routes
  // was silently CORS-rejected by the browser — surfacing in the UI as
  // "Error connecting to verification server" / a poll that never
  // updates, with no useful reason logged client-side (the browser hides
  // the real CORS error from JS, same as the note at the top of this
  // file describes for the earlier Developer Portal case).
  /^\/api\/payment-link\/order\//,
  /^\/api\/sms\/verify-manual/,
];

app.use((req, res, next) => {
  if (OPEN_CORS_PATHS.some(re => re.test(req.path))) return developerCors(req, res, next);
  return dashboardCors(req, res, next);
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan('combined', { stream: { write: m => logger.info(m.trim()) } }));

// Rate limiting
const { generalLimiter } = require('./middleware/rateLimiter');
app.use('/api/', generalLimiter);

// ── Health Check (no Firebase needed) ──
app.get('/', (req, res) => {
  res.json({ name: 'ZapPay API', version: '1.0.0', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ── Routes ──
app.use('/api/config',       require('./routes/config'));
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/user',         require('./routes/user'));
app.use('/api/wallet',       require('./routes/wallet'));
app.use('/api/payment',      require('./routes/payment'));
app.use('/api/payment-link', require('./routes/paymentLink'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/withdrawal',   require('./routes/withdrawal'));
app.use('/api/notification', require('./routes/notification'));
app.use('/api/referral',     require('./routes/referral'));
app.use('/api/promo',        require('./routes/promo'));
app.use('/api/support',      require('./routes/support'));
app.use('/api/admin',        require('./routes/admin'));
app.use('/api/webhook',      require('./routes/webhook'));
app.use('/api/developer',    require('./routes/developer'));
app.use('/api/gateway-test', require('./routes/gatewayTest'));
app.use('/api/store',        require('./routes/store'));
app.use('/api/store-public', require('./routes/storePublic'));
app.use('/api/otp',          require('./routes/otp'));
app.use('/api/agent',        require('./routes/agent'));
app.use('/api/sms',          require('./routes/sms'));
app.use('/api/fampay',       require('./routes/fampay'));
app.use('/api/paytm',        require('./routes/paytm'));
app.use('/api/history',      require('./routes/history'));


// ── Error Handlers ──
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler.notFoundHandler);
app.use(errorHandler);

// ── Start ──
// For Vercel: module.exports must come before or alongside app.listen
// Vercel uses the exported app directly in serverless mode
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
  // Local development only
  app.listen(PORT, () => {
    logger.info(`🚀 ZapPay running on http://localhost:${PORT}`);
  });
}
// In production (Vercel), the exported `app` is used directly as the
// serverless handler — no app.listen() needed there.

module.exports = app;
