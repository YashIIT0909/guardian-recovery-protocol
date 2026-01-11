# SentinelX - Backend

Node.js/TypeScript backend for SentinelX decentralized account recovery on Casper Network. Built with Express.js and integrates with Supabase for persistent storage.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

## Tech Stack

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Blockchain SDK:** casper-js-sdk
- **Database:** Supabase (PostgreSQL)
- **Email:** Nodemailer (SMTP)
- **HTTP Client:** Axios

## Architecture

```
backend/
├── src/
│   ├── config/                    # Environment configuration
│   │   └── config.ts
│   ├── services/                  # Core business logic
│   │   ├── casper.service.ts      # Casper SDK integration & key management
│   │   ├── contract.service.ts    # Smart contract interactions
│   │   ├── deploy.service.ts      # Deploy building & submission
│   │   ├── email.service.ts       # Guardian notification emails
│   │   ├── multisig.service.ts    # Multi-signature operations
│   │   ├── session.service.ts     # Session WASM handling
│   │   └── user.service.ts        # User management & Supabase
│   ├── routes/                    # API endpoint handlers
│   │   ├── account.routes.ts      # Account queries
│   │   ├── multisig-deploy.routes.ts  # Multi-sig deploy management
│   │   ├── recovery.routes.ts     # Full recovery flow
│   │   ├── session.routes.ts      # Session WASM deploys
│   │   └── user.routes.ts         # User profile management
│   ├── types/                     # TypeScript type definitions
│   │   └── index.ts
│   └── index.ts                   # Express server entry point
├── sql/                           # Database migrations
│   ├── add_account_hash.sql
│   └── recovery_deploys.sql
├── wasm/                          # Compiled session WASMs
│   ├── add_associated_key.wasm
│   ├── remove_associated_key.wasm
│   └── update_thresholds.wasm
└── package.json
```

## API Endpoints

### Recovery Flow

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/recovery/register` | Register guardians for account |
| POST | `/api/recovery/initiate` | Start a new recovery |
| POST | `/api/recovery/approve` | Guardian approves recovery |
| GET | `/api/recovery/status/:hash` | Get recovery status |
| GET | `/api/recovery/:accountHash` | Get recovery by account |

### Session WASM Deploys

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/session/add-key` | Build add key deploy |
| POST | `/api/session/remove-key` | Build remove key deploy |
| POST | `/api/session/update-thresholds` | Build threshold update deploy |
| POST | `/api/session/submit` | Submit signed deploy |

### Multi-Sig Deploy Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/multisig-deploy/create` | Create multi-sig deploy |
| POST | `/api/multisig-deploy/sign` | Add guardian signature |
| POST | `/api/multisig-deploy/send` | Send completed deploy |
| GET | `/api/multisig-deploy/:recoveryId` | Get deploy status |

### Account & User Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/account/:hash` | Get account info |
| GET | `/api/account/:hash/guardians` | Get registered guardians |
| POST | `/api/user/register` | Register user profile |
| GET | `/api/user/:publicKey` | Get user details |

## Environment Variables

```bash
# Environment
NODE_ENV=development
PORT=3001

# Casper Network
CASPER_NODE_URL=https://rpc.testnet.casperlabs.io/rpc
CASPER_CHAIN_NAME=casper-test

# WASM Paths (relative to backend root)
WASM_ADD_KEY_PATH=./wasm/add_associated_key.wasm
WASM_REMOVE_KEY_PATH=./wasm/remove_associated_key.wasm
WASM_UPDATE_THRESHOLDS_PATH=./wasm/update_thresholds.wasm

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=SentinelX <your-email@gmail.com>
APP_URL=http://localhost:3000
```

## Recovery Flow

```
1. Register    → User sets up trusted guardians
2. Initiate    → Guardian starts recovery with new key
3. Approve     → Multiple guardians sign approval
4. Build Deploy → Backend creates multi-sig session deploy
5. Sign Deploy → Guardians add signatures until threshold met
6. Execute     → Deploy sent to Casper, key rotated
```

## Database Schema

The backend uses Supabase with the following tables:

- **users** - User profiles and public keys
- **recovery_deploys** - Multi-sig deploy tracking with signature chain

See `sql/` directory for migration scripts.

## Development

```bash
# Run in development mode with hot-reload
npm run dev

# Type checking
npm run build

# Lint code
npm run lint
```
