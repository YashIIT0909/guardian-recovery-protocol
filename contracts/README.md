# SentinelX - Smart Contracts

Casper-native smart contracts and session WASMs for threshold-based account recovery.

## Architecture

```
┌─────────────────────────────────────┐
│     recovery_registry (Contract)    │  ← Coordination only
│  - Store guardians                  │
│  - Store thresholds                 │
│  - Query guardian status            │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│     Frontend (Off-chain)            │
│  - Read contract state              │
│  - Build deploy with session WASM   │
│  - Collect guardian signatures      │
│  - Submit deploy to network         │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│     Session WASMs (Key Operations)  │  ← Executed in account context
│  - add_associated_key.wasm          │
│  - remove_associated_key.wasm       │
│  - update_thresholds.wasm           │
└─────────────────────────────────────┘
```

## Quick Start

```bash
# Install WASM target
make prepare

# Build all WASMs
make build

# Copy to wasm/ folder
make copy-wasm
```

## Project Structure

```
contracts/
├── Cargo.toml              # Workspace config
├── Makefile                # Build commands
├── types/                  # Shared types library
├── recovery_registry/      # Stored contract (coordination)
├── add_associated_key/     # Session WASM
├── remove_associated_key/  # Session WASM
└── update_thresholds/      # Session WASM
```

## Contracts vs Session WASM

| Type | Purpose | Execution Context |
|------|---------|-------------------|
| **recovery_registry** | Store guardian info | Contract storage |
| **Session WASMs** | Modify account keys | Account context |

> ⚠️ **Important**: Key rotation MUST happen via session WASM, not stored contracts. This is a Casper security requirement.

## Documentation

- [Frontend Integration Guide](./frontend-integration.md)
- [Casper Multi-sig Docs](https://docs.casper.network/resources/tutorials/advanced/multi-sig/)

## License

MIT
