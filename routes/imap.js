// routes/imap.js
//
// Public REST endpoints that expose imapService.js over HTTP.
//
//  GET  /api/imap/verify-status  — replaces verify_status.php
//       Query: utr, email, pass, amount, mode, order_id, since
//
//  POST /api/imap/history        — replaces history.php (POST keeps password out of URL logs)
//       Body: { email, pass, limit }
//
// These routes are added to OPEN_CORS_PATHS in server.js so that
// zetpay.online (checkout.html) can call them without CORS errors.

const express     = require('express');
const router      = express.Router();
const imapService = require('../services/imapService');
const logger      = require('../utils/logger');

// GET /api/imap/verify-status
// Called by checkout.html during payment polling.
// Mirrors the exact query-string interface of verify_status.php so the
// frontend URL only needs the hostname changed, nothing else.
router.get('/verify-status', async (req, res) => {
  try {
    const {
      utr,
      email,
      pass,
      amount,
      mode,
      order_id,
      since,
    } = req.query;

    const result = await imapService.verifyStatus({
      utr,
      email,
      pass,
      amount:  amount != null ? parseFloat(amount) : null,
      mode:    mode || 'order',
      orderId: order_id || utr,
      since:   since   ? parseInt(since, 10) : null,
    });

    return res.json(result);
  } catch (err) {
    logger.error('GET /api/imap/verify-status error:', err.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/imap/history
// Accepts { email, pass, limit } as JSON body.
// Also accepts GET ?email=&pass=&limit= for backward compat.
router.post('/history', async (req, res) => {
  try {
    const email = req.body.email || req.query.email;
    const pass  = req.body.pass  || req.query.pass;
    const limit = parseInt(req.body.limit || req.query.limit || '20', 10);

    if (!email || !pass) {
      return res.status(400).json({ status: false, error: 'email and pass params are required.', data: [] });
    }

    const result = await imapService.getHistory(email, pass, limit);
    return res.json(result);
  } catch (err) {
    logger.error('POST /api/imap/history error:', err.message);
    return res.status(500).json({ status: false, error: 'Internal server error', data: [] });
  }
});

module.exports = router;
