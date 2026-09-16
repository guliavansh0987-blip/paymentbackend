// config/constants.js - Application Constants

module.exports = {
  ROLES: {
    USER: 'user',
    ADMIN: 'admin',
  },

  PAYMENT_STATUS: {
    PENDING: 'pending',
    SUCCESS: 'success',
    FAILED: 'failed',
    TIMEOUT: 'timeout',
  },

  WITHDRAWAL_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
  },

  PAYMENT_LINK_STATUS: {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    DISABLED: 'disabled',
  },

  SUBSCRIPTION_STATUS: {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    CANCELLED: 'cancelled',
  },

  // Multi-month subscription discount tiers. `months` multiplies a plan's
  // monthly `price`; `discountPercent` is then taken off that total. This
  // is the ONLY place these numbers live — subscriptionService reads it
  // to price every purchase server-side, and the frontend fetches it via
  // GET /subscription/duration-options so both always agree.
  SUBSCRIPTION_DURATIONS: [
    { months: 1,  discountPercent: 0  },
    { months: 3,  discountPercent: 2  },
    { months: 6,  discountPercent: 5  },
    { months: 12, discountPercent: 12 },
    { months: 24, discountPercent: 25 },
  ],

  NOTIFICATION_TYPE: {
    PAYMENT: 'payment',
    WITHDRAWAL: 'withdrawal',
    GENERAL: 'general',
    SYSTEM: 'system',
    SUBSCRIPTION: 'subscription',
    SECURITY: 'security',
    ADMIN_NOTICE: 'admin_notice',
  },

  DB_PATHS: {
    USERS: 'users',
    PAYMENTS: 'payments',
    WITHDRAWALS: 'withdrawals',
    NOTIFICATIONS: 'notifications',
    SETTINGS: 'settings',
    PROCESSED_ORDERS: 'processedOrders',
    ACTIVITY_LOGS: 'activityLogs',
    PLANS: 'plans',
    USER_SUBSCRIPTIONS: 'userSubscriptions',
    PAYMENT_LINKS: 'paymentLinks',
    COMMISSION_LOGS: 'commissionLogs',
    REFERRALS: 'referrals',
    REFERRAL_CODES: 'referralCodes',
    PROMO_CODES: 'promoCodes',
    PROMO_REDEMPTIONS: 'promoRedemptions',
    SUPPORT_MESSAGES: 'supportMessages',
    SUPPORT_THREADS: 'supportThreads',
    API_TOKENS: 'apiTokens', // ZapAPI key -> uid reverse-lookup index (Developer Portal)
    STORES: 'stores', // per-user store settings + products (Store Portal)
    STORE_ID_INDEX: 'storeIdIndex', // public storeId -> uid reverse-lookup index (store.html)
  },

  // Quick-pick reasons shown to admin when banning a user (also usable as-is as
  // the message the banned user sees). Admin can still type a custom reason.
  BAN_REASON_TEMPLATES: [
    'Your account has been suspended due to detected scamming or fraudulent activity.',
    'Your account has been suspended due to multiple user complaints against you.',
    'Your account has been suspended for suspicious or illegal activity on the platform.',
    'Your account has been suspended for violating our Terms & Conditions.',
    'Your account has been suspended for using the platform to facilitate gambling or betting transactions.',
  ],

  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',

  ZAP_API_URL: process.env.ZAP_API_URL || 'https://pay.zapupi.com/api',

  DEFAULT_SETTINGS: {
    minWithdrawal: 100,
    commissionPercent: 5,
    maintenanceMode: false,
    siteName: 'ZetPay',
    supportEmail: 'support@zappay.in',
    // Referral program
    signupBonus: 100,                   // ₹ credited to a NEW user who signs up via a referral link
    referralCommissionPercent: 25,      // % of the referred user's qualifying deposit paid to the referrer
    referralQualifyingMinDeposit: 100,  // minimum wallet top-up (₹) that counts as a "qualifying" deposit
    // Social / contact links — edit url + enabled per channel (enabled controls visibility on Contact Us page)
    socialLinks: {
      telegram:  { url: 'https://t.me/SovitX_developer', enabled: true },
      instagram: { url: 'https://www.instagram.com/only_sovitx?igsh=djZudm5rcTYwOGM4', enabled: true },
      youtube:   { url: 'https://youtube.com/@ai_science_sovitx?si=vq06Nie8s66d4SOZ', enabled: true },
      whatsapp:  { url: '', enabled: false },
    },
  },

  // Default promo codes — seeded once, never overwritten by backend (admin can edit later)
  DEFAULT_PROMO_CODES: {
    WELCM5: {
      code: 'WELCM5',
      type: 'fixed',       // 'fixed' = flat ₹ credit, 'percent' = % of next deposit (reserved for future use)
      value: 5,
      maxUses: -1,          // -1 = unlimited
      usedCount: 0,
      perUserLimit: 1,
      isActive: true,
      description: 'Welcome bonus — ₹5 Zap Bonus credit',
      createdAt: Date.now(),
    },
  },

  // Default plans — seeded once, never overwritten by backend
  DEFAULT_PLANS: {
    blaze: {
      id: 'blaze',
      name: '⚡ Blaze',
      badge: 'Free',
      price: 0,
      walletLimit: 500,
      paymentLinksPerMonth: 100,
      linkExpiryDays: 7,
      commissionPercent: 5,
      withdrawalCount: 1,
      withdrawalPeriod: 'week',
      features: ['100 Payment Links/month', '7 Day Link Expiry', '₹500 Wallet Limit', '1 Withdrawal/week', '5% Commission', 'Unlock premium themes (Silver+)', 'Free Store Access'],
      isActive: true,
      isHighlighted: false,
      isDefault: true,
      displayOrder: 1,
    },
    bronze: {
      id: 'bronze',
      name: '🥉 Bronze',
      badge: 'Starter',
      price: 29,
      walletLimit: 1000,
      paymentLinksPerMonth: 250,
      linkExpiryDays: 15,
      commissionPercent: 3.5,
      withdrawalCount: 3,
      withdrawalPeriod: 'week',
      features: ['250 Payment Links/month', '15 Day Link Expiry', '₹1,000 Wallet Limit', '3 Withdrawals/week', '3.5% Commission', 'Unlock premium themes (Silver+)', 'Free Store Access'],
      isActive: true,
      isHighlighted: false,
      isDefault: false,
      displayOrder: 2,
    },
    silver: {
      id: 'silver',
      name: '🥈 Silver',
      badge: 'Most Popular',
      price: 59,
      walletLimit: 3000,
      paymentLinksPerMonth: 1000,
      linkExpiryDays: 30,
      commissionPercent: 2,
      withdrawalCount: 1,
      withdrawalPeriod: 'day',
      features: ['1,000 Payment Links/month', '30 Day Link Expiry', '₹3,000 Wallet Limit', '1 Withdrawal/day', '2% Commission', 'Unlock premium themes', 'Free Store Access'],
      isActive: true,
      isHighlighted: true, // Silver is Most Popular
      isDefault: false,
      displayOrder: 3,
    },
    gold: {
      id: 'gold',
      name: '🥇 Gold',
      badge: 'Premium',
      price: 149,
      walletLimit: 7500,
      paymentLinksPerMonth: 3000,
      linkExpiryDays: 90,
      commissionPercent: 1,
      withdrawalCount: 3,
      withdrawalPeriod: 'day',
      features: ['3,000 Payment Links/month', '90 Day Link Expiry', '₹7,500 Wallet Limit', '3 Withdrawals/day', '1% Commission', 'Unlock premium themes', 'Free Store Access'],
      isActive: true,
      isHighlighted: false,
      isDefault: false,
      displayOrder: 4,
    },
    developer: {
      id: 'developer',
      name: '👨‍💻 Developer',
      badge: 'Unlimited',
      price: 299,
      walletLimit: 20000,
      paymentLinksPerMonth: -1,
      linkExpiryDays: -1,
      commissionPercent: 0.5,
      withdrawalCount: 10,
      withdrawalPeriod: 'day',
      features: ['Unlimited Payment Links', 'No Link Expiry', '₹20,000 Wallet Limit', '10 Withdrawals/day', '0.5% Commission', 'Unlock premium themes', 'Free Store Access'],
      isActive: true,
      isHighlighted: false,
      isDefault: false,
      displayOrder: 5,
    },
  },
};
