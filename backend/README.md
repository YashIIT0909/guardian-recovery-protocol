# Guardian Recovery Protocol - Backend

Node.js/TypeScript backend for the Guardian Recovery Protocol on Casper Network.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run development server
npm run dev
```

## Architecture

```
backend/
├── src/
│   ├── config/         # Configuration
│   ├── services/       # Casper SDK logic
│   │   ├── casper.service.ts    # Node connection
│   │   ├── deploy.service.ts    # Deploy building
│   │   ├── contract.service.ts  # Contract calls
│   │   └── session.service.ts   # Session WASM
│   ├── routes/         # API endpoints
│   │   ├── recovery.routes.ts   # Recovery flow
│   │   ├── session.routes.ts    # WASM deploys
│   │   └── account.routes.ts    # Account queries
│   ├── types/          # TypeScript types
│   └── index.ts        # Entry point
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/recovery/register | Register guardians |
| POST | /api/recovery/initiate | Start recovery |
| POST | /api/recovery/approve | Approve recovery |
| GET | /api/recovery/status/:hash | Check status |
| POST | /api/session/add-key | Build add key deploy |
| POST | /api/session/remove-key | Build remove key deploy |
| POST | /api/session/submit | Submit signed deploy |

## Recovery Flow

1. **Register** → User sets up guardians
2. **Initiate** → Guardian proposes recovery
3. **Approve** → Guardians approve
4. **Add Key** → Guardians jointly add new key
5. **Remove Key** → Remove old key
6. **Update Thresholds** → Lock down account
