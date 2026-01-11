# SentinelX - Smart Contracts

Casper-native smart contracts and session WASMs for threshold-based account recovery. Built in Rust with the Casper SDK.

## Architecture

```
┌─────────────────────────────────────┐
│     recovery_registry (Contract)    │  ← Coordination contract
│  - Store guardians per account      │
│  - Store threshold requirements     │
│  - Track recovery requests          │
│  - Query guardian status            │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│     Frontend/Backend (Off-chain)    │
│  - Read contract state              │
│  - Build deploys with session WASMs │
│  - Collect guardian signatures      │
│  - Submit multi-sig deploys         │
└─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│     Session WASMs (Key Operations)  │  ← Executed in user's account context
│  - add_associated_key.wasm          │  ← Add new key to account
│  - remove_associated_key.wasm       │  ← Remove old/lost key
│  - update_thresholds.wasm           │  ← Modify action thresholds
│  - update_associated_keys.wasm      │  ← Batch key updates
│  - recovery_key_rotation.wasm       │  ← Complete key rotation flow
└─────────────────────────────────────┘
```

## Quick Start

```bash
# Install WASM target
make prepare

# Build all contracts and WASMs
make build

# Copy compiled WASMs to output folder
make copy-wasm

# Run tests
make test
```

## Project Structure

```
contracts/
├── Cargo.toml                    # Workspace configuration
├── Makefile                      # Build automation
├── rust-toolchain.toml           # Rust version pinning
├── types/                        # Shared types library
│   └── src/lib.rs
│
├── recovery_registry/            # Main coordination contract
│   ├── Cargo.toml
│   └── src/main.rs
│
├── add_associated_key/           # Session WASM: Add key
│   ├── Cargo.toml
│   └── src/main.rs
│
├── remove_associated_key/        # Session WASM: Remove key
│   ├── Cargo.toml
│   └── src/main.rs
│
├── update_thresholds/            # Session WASM: Update thresholds
│   ├── Cargo.toml
│   └── src/main.rs
│
├── update_associated_keys/       # Session WASM: Batch key updates
│   ├── Cargo.toml
│   └── src/main.rs
│
├── recovery_key_rotation/        # Session WASM: Full rotation
│   ├── Cargo.toml
│   └── src/main.rs
│
├── test_contract/                # Testing utilities
│   └── src/
│
├── wasm/                         # Compiled output (gitignored)
└── target/                       # Build artifacts (gitignored)
```

## Contracts vs Session WASMs

| Type | Purpose | Execution Context | Persistence |
|------|---------|-------------------|-------------|
| **recovery_registry** | Coordinate recovery | Contract's own storage | Permanent on-chain |
| **Session WASMs** | Modify account keys | Target account context | One-time execution |

> ⚠️ **Critical**: Key rotation MUST happen via session WASM, not stored contracts. Session code runs in the target account's context with the signer's permissions. This is a Casper security requirement.

## Session WASM Details

### add_associated_key.wasm
Adds a new public key to the account's associated keys with specified weight.
- **Args:** `account` (PublicKey), `weight` (U8)
- **Requires:** Signer(s) meeting key management threshold

### remove_associated_key.wasm
Removes a public key from the account's associated keys.
- **Args:** `account` (PublicKey)
- **Requires:** Signer(s) meeting key management threshold

### update_thresholds.wasm
Updates deployment and key management thresholds.
- **Args:** `deployment` (U8), `key_management` (U8)
- **Requires:** Signer(s) meeting key management threshold

### update_associated_keys.wasm
Batch update of key weights and optionally thresholds.
- **Args:** `keys_to_update` (Map<PublicKey, U8>)
- **Requires:** Signer(s) meeting key management threshold

### recovery_key_rotation.wasm
Complete key rotation: adds new key, removes old key, updates thresholds.
- **Args:** `new_key` (PublicKey), `old_key` (PublicKey), `new_weight` (U8)
- **Requires:** Guardian signatures meeting recovery threshold

## Multi-Signature Flow

```
1. User loses primary key (weight 3)
2. Guardians (weights 1+1+1) collaborate:
   a. Build session deploy for add_associated_key
   b. Each guardian signs the same deploy
   c. Combined weight ≥ key_management threshold
3. Deploy submitted with all signatures
4. New key added → old key removed → account recovered
```

## Building Individual Contracts

```bash
# Build specific contract
cargo build --release --target wasm32-unknown-unknown -p add_associated_key

# Build all
cargo build --release --target wasm32-unknown-unknown --workspace

# Optimize WASM size
wasm-strip target/wasm32-unknown-unknown/release/*.wasm
```

## Documentation

- [Frontend Integration Guide](./frontend-integration.md) - How to integrate with the frontend
- [Casper Multi-sig Docs](https://docs.casper.network/resources/tutorials/advanced/multi-sig/) - Official Casper documentation

## Testing

```bash
# Run all tests
make test

# Run specific test
cargo test -p recovery_registry
```

## License

MIT
