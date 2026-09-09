# ZapPay Backend Service

Production-ready backend API service for **ZapPay** — Reseller Payment Link Platform. Built with Node.js, Express, Firebase Realtime Database, Firebase Authentication, and integrated payment gateway services.

## 🚀 Features

- **Authentication & Authorization**: Firebase Auth integration with role-based JWT verification.
- **Payment Link Management**: Dynamic generation, tracking, and reseller profit split computation.
- **Webhooks & Callbacks**: Gateway webhooks for automated order fulfillment and status updates.
- **Subscriptions & Promo Engine**: Tiered subscription plans and coupon code validations.
- **Security & Rate Limiting**: Helmet security headers, proxy trust configuration, and rate limiters.
- **Serverless & Container Ready**: Optimized for deployment on Vercel, Render, Railway, or standalone VPS.

## 📁 Project Structure

```text
Backend/
├── config/             # Environment configs and constants
├── controllers/        # Route business logic handlers
├── firebase/           # Firebase Admin SDK initialization
├── helpers/            # Helper functions & utility transformers
├── middleware/         # Auth, validation, rate limiting & error handlers
├── routes/             # Express API route definitions
├── services/           # Service layer for payment, email, DB operations
├── utils/              # Winston logging and helpers
├── webhooks/           # Gateway webhook handlers
├── .env.example        # Environment variable template
├── .gitignore          # Git ignore specifications
├── package.json        # Dependencies and scripts
├── server.js           # Main Express application entrypoint
└── vercel.json         # Vercel deployment configuration
```

## 🛠️ Getting Started

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn
- Firebase Project with Realtime Database enabled

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   ```bash
   cp .env.example .env
   ```
   Fill in your Firebase credentials, API keys, and environment variables in `.env`.

4. Start development server:
   ```bash
   npm run dev
   ```

5. Run in production:
   ```bash
   npm start
   ```

## 🔐 Environment Variables

Refer to `.env.example` for all required environment variables, including Firebase Admin SDK configurations, encryption secrets, and third-party gateway keys.

## 📄 License
ISC / Private
