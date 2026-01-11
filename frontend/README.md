# SentinelX - Frontend

Modern Next.js 15 web application for decentralized account recovery on Casper Network. Built with React 19, TypeScript, and TailwindCSS.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **React:** React 19
- **Language:** TypeScript 5
- **Styling:** TailwindCSS 4
- **UI Components:** Radix UI + shadcn/ui
- **Animations:** Framer Motion + GSAP
- **Forms:** React Hook Form + Zod
- **Blockchain:** casper-js-sdk
- **HTTP Client:** Axios

## Project Structure

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Landing page
│   ├── globals.css              # Global styles
│   ├── admin/                   # Admin panel (contract deployment)
│   │   └── page.tsx
│   ├── dashboard/               # Guardian dashboard
│   │   └── page.tsx
│   ├── recovery/                # Recovery initiation flow
│   │   └── page.tsx
│   └── setup/                   # Guardian setup wizard
│       └── page.tsx
│
├── components/                   # React components
│   ├── ui/                      # shadcn/ui components (57 components)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── toast.tsx
│   │   └── ...
│   ├── hero-section.tsx         # Landing page hero
│   ├── principles-section.tsx   # Feature highlights
│   ├── work-section.tsx         # How it works
│   ├── side-nav.tsx             # Navigation
│   └── theme-provider.tsx       # Dark/light mode
│
├── hooks/                        # Custom React hooks
│   └── use-toast.ts
│
├── lib/                          # Utilities
│   ├── utils.ts                 # Helper functions
│   └── casper/                  # Casper SDK utilities
│
├── styles/                       # Additional styles
│   └── ...
│
├── public/                       # Static assets
│   ├── logo.svg
│   └── ...
│
├── next.config.mjs              # Next.js configuration
├── tailwind.config.ts           # TailwindCSS configuration
├── tsconfig.json                # TypeScript configuration
└── package.json
```

## Pages

| Route | Purpose | User |
|-------|---------|------|
| `/` | Landing page | Anyone |
| `/setup` | Register guardians for your account | Account owner |
| `/recovery` | Start a recovery request | Guardian |
| `/dashboard` | View/approve recoveries, execute key rotation | Guardian |
| `/admin` | Deploy recovery contract (one-time setup) | Admin |

## Features

### Landing Page (`/`)
- Animated hero section with Casper branding
- How it works walkthrough
- Security principles showcase
- Call-to-action for setup

### Guardian Setup (`/setup`)
1. Connect Casper Wallet
2. Add trusted guardian public keys
3. Set recovery threshold (e.g., 2 of 3)
4. Sign and deploy configuration

### Recovery Initiation (`/recovery`)
1. Connect as guardian
2. Enter account hash to recover
3. Enter new public key for owner
4. Sign recovery initiation

### Guardian Dashboard (`/dashboard`)
- View pending recovery requests
- Approve recoveries (sign with guardian key)
- Track approval progress
- Execute key rotation when ready

## Environment Variables

Create a `.env.local` file:

```bash
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001

# Casper Network
NEXT_PUBLIC_CASPER_NODE_URL=https://rpc.testnet.casperlabs.io/rpc
NEXT_PUBLIC_CHAIN_NAME=casper-test
```

## Casper Wallet Integration

The app integrates with Casper Wallet for:
- Account connection
- Transaction signing
- Multi-signature operations

```typescript
// Connect wallet
const { activePublicKey, isConnected } = useCasperWallet();

// Sign message
const signature = await signMessage(message);

// Sign deploy
const signedDeploy = await signDeploy(deployJson);
```

## Development

```bash
# Development server with hot reload
npm run dev

# Type checking
npm run lint

# Build production bundle
npm run build

# Preview production build
npm start
```

## UI Components

Built on [shadcn/ui](https://ui.shadcn.com/) with 57+ pre-built components:
- Buttons, Cards, Dialogs
- Forms with validation
- Toast notifications
- Data tables
- Dropdown menus
- And more...

## Styling

Uses TailwindCSS 4 with:
- CSS custom properties for theming
- Dark mode support via `next-themes`
- Smooth animations via `tw-animate-css`
- Responsive design (mobile-first)

## API Integration

All API calls go through the backend:

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL
});

// Register guardians
await api.post('/api/recovery/register', { ... });

// Start recovery
await api.post('/api/recovery/initiate', { ... });

// Approve recovery
await api.post('/api/recovery/approve', { ... });
```

## Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Set environment variables in Vercel dashboard:
- `NEXT_PUBLIC_API_URL` - Your deployed backend URL
- `NEXT_PUBLIC_CASPER_NODE_URL` - Casper RPC endpoint
- `NEXT_PUBLIC_CHAIN_NAME` - Network name

## License

MIT
