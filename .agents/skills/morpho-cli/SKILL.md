---
name: morpho-cli
description: Manage Morpho protocol vaults, markets, and reward programs via the morpho-list CLI. Use when adding vaults/markets, deploying or managing reward programs, compiling the masterlist, or any registry operation.
license: MIT
metadata:
  audience: developers
  workflow: local
---

# Morpho List CLI

Filesystem-based registry of Morpho protocol vaults, markets, rewards, and blacklists. All mutations go through the CLI — never create or edit `data.json` files by hand.

## Environment

Requires a `.env` file with:
- `VENN_URL` — RPC gateway base URL. RPC URLs are constructed as `${VENN_URL}/<chain-internalName>`.
- `ETHEREUM_PRIVATE_KEY` — only needed for reward commands that sign transactions.

## Chains

Use the `internalName` from `@gfxlabs/oku-chains` or a numeric chain ID:

| Chain ID | Name |
|----------|------|
| 1 | `ethereum` |
| 8453 | `base` |
| 137 | `polygon` |
| 480 | (World Chain) |
| 1329 | (Sei) |
| 10 | (Optimism) |
| 42793 | (Etherlink) |
| 21000000 | (Corn) |
| 1672 | `pharos` (V2-only — use `--version 2`) |

New chain directories are created automatically by the CLI.

---

## Adding Vaults

```bash
yarn tsx cli.ts add vault <chain> <vault-address> [--version 1|2] [--force] [--with-markets] [--dir chains]
```

- Fetches vault data on-chain via Morpho SDK, writes to `chains/<chainId>/vaults/<checksummed-address>/data.json`.
- `--with-markets` (default: **true**) automatically fetches and stores all markets the vault allocates to.
- `--force` overwrites existing vault/market data.
- Folder names use **checksummed** addresses (mixed case via `viem.getAddress()`), not all-lowercase.
- Existing markets are skipped with a log message unless `--force` is passed.

### Vault versions (v1 vs v2)

`--version` defaults to **`1`** (MetaMorpho). Pass `--version 2` for VaultV2 vaults.

- **v1 path** (`fetchAccrualVault` via the SDK) requires a `metaMorphoFactory` registered for the chain. Chains with only a V2 Morpho deployment (e.g. Pharos, chainId `1672`) have **no** `metaMorphoFactory`, so running v1 against a V2 vault fails with:

  ```
  Internal Error: unknown factory
      at fetchVault (.../blue-sdk-viem/lib/esm/fetch/Vault.js)
  ```

  This is the SDK's `UnknownFactory` error — it means you used the wrong `--version`, or the chain has no v1 deployment. Retry with `--version 2`.

- **v2 path** reads `asset`/`name`/`performanceFee`/`curator` directly and enumerates the vault's adapters to discover markets:
  - `MorphoMarketV1AdapterV2` (has `marketIdsLength`/`marketIds`) → contributes Morpho Blue market IDs.
  - `MorphoVaultV1Adapter` (has `morphoVaultV1`) → wraps a v1 vault, which is auto-added with `--version 1`.
- A freshly deployed V2 vault can have an adapter wired up but **zero markets** (`marketIdsLength() == 0`), so `markets: []` is normal — it just means no Morpho Blue markets have been allocated yet. The vault still stores fine.
- Chain availability of factories comes from `@gfxlabs/oku-chains`; only chains whose `uniswap` config has `wrappedNativeAddress` + `permit2` get injected into the SDK (`src/inject.ts`). V2-only chains may not be injected at all.

### Bulk adding vaults

When adding many vaults, run them in parallel — each vault writes to its own directory so there are no conflicts. Use a shell loop:

```bash
add_vault() {
  yarn tsx cli.ts add vault "$1" "$2" 2>&1
}

for addr in 0xabc... 0xdef...; do
  add_vault ethereum "$addr" &
done
wait
```

Collect failures separately. A failure with `unknown factory` means the vault is a VaultV2 (or on a V2-only chain) — re-run that address with `--version 2`.

## Adding Markets

```bash
yarn tsx cli.ts add market <chain> <market-id> [--force] [--dir chains]
```

- `<market-id>` must be `0x` + 64 lowercase hex chars (66 chars total).
- Fetches market params on-chain, validates loan token is not zero address.
- Usually not needed directly — `add vault` adds markets automatically.

## Compiling the Masterlist

```bash
yarn compile
# or:
make list
```

- Reads all `data.json` files, validates with Zod schemas, checks for duplicates, writes `public/masterlist.json`.
- **Never edit `masterlist.json` directly** — it is always regenerated.
- The pre-commit hook (`.husky/pre-commit`) runs `corepack yarn compile` automatically and commits any masterlist changes.

Always run `yarn compile` after adding vaults/markets to verify everything passes validation.

---

## Reward Program Commands

All reward commands require `ETHEREUM_PRIVATE_KEY` in `.env` for signing transactions.

### Deploy a new reward program

```bash
yarn tsx cli.ts reward deploy <chain> <unique-id> [--prod] [--hash-prefix "oku:v0.0.0"] [--dir chains]
```

- Creates a new Universal Rewards Distributor (URD) contract on-chain.
- `--prod` sets a 3-day timelock and configures the production publisher.
- Without `--prod`, configures dev publishers and no timelock.
- Writes a **placeholder** `data.json` to `chains/<chainId>/rewards/<id>/data.json` — you must edit it with the actual reward parameters (token, amount, timestamps, vault/market).
- The `<unique-id>` must not already exist across all chains.

### List all reward programs

```bash
yarn tsx cli.ts reward list [--dir chains]
```

### Show detailed reward info

```bash
yarn tsx cli.ts reward info [reward-id] [--dir chains]
```

Shows campaign details, on-chain state, timelock status, and timeline. If `reward-id` is omitted, presents an interactive search prompt.

### Update a pending root

```bash
yarn tsx cli.ts reward update [reward-id] <root-hash> [--dir chains]
```

- `<root-hash>` must be a valid 32-byte hex hash.

### Accept a pending root

```bash
yarn tsx cli.ts reward accept [reward-id] [--dir chains]
```

- Accepts the current pending root after the timelock has expired.

### Republish a root

```bash
yarn tsx cli.ts reward republish-root [reward-id] [--dir chains]
```

- Re-submits the current pending root (resets the timelock). Requires interactive confirmation.

### Check a single reward's pending root

```bash
yarn tsx cli.ts reward check [reward-id] [--dir chains]
```

- Compares on-chain pending root with the endpoint root.
- Validates campaign progress (total claimable vs expected based on time elapsed).
- Checks for blacklisted addresses in the reward tree.
- Shows timelock status.

### Check all pending roots

```bash
yarn tsx cli.ts reward check-all-pending [--dir chains]
```

- Batch validation of all reward programs with pending roots.
- Prints a summary with valid/invalid/error counts.
- Lists ready-to-accept commands at the end.

### List rewards with pending roots

```bash
yarn tsx cli.ts reward pending [--dir chains]
```

### Add a root publisher

```bash
yarn tsx cli.ts reward add-publisher [reward-id] <publisher-address> [--dir chains]
```

### Set timelock period

```bash
yarn tsx cli.ts reward set-timelock [reward-id] [--timelock 57600] [--dir chains]
```

- Default timelock is 57600 seconds (16 hours).

### Transfer URD ownership

```bash
yarn tsx cli.ts reward transfer-owner [reward-id] <new-owner-address> [--dir chains]
```

- **Irreversible** — requires double confirmation.

---

## Data Schemas

All data is validated with Zod schemas in `src/lib/types.ts`.

**Vault fields:** `chainId`, `name`, `tokenAddress`, `performanceFeePercentage` (numeric string, raw 18-decimal), `vaultAddress`, `guardianAddress`, `curatorAddress`, `enabled`, optional `blacklisted`.

**Market fields:** `chainId`, `marketId` (0x + 64 hex), `collateralTokenAddress`, `loanTokenAddress`, `oracleAddress`, `irmAddress`, `lltvPercent` (numeric string), `liquidationPenalty` (numeric string), `enabled`.

**Reward fields:** `id`, `type` ("vault"/"market"), `vault`/`market`, `start_timestamp`, `end_timestamp`, `reward_token`, `reward_amount`, `urdAddress`, `salt`, `name`, `chainId`, `production`, `finished`.

Address format: `^0x[a-f0-9]{40}$` (lowercase). Hash format: `^0x[a-f0-9]{64}$` (lowercase).

---

## Important Warnings

1. **Never create `data.json` files by hand** — always use the CLI commands.
2. **Never edit `public/masterlist.json`** — it is regenerated by `yarn compile`.
3. **v2 vaults need `--version 2`** — the default v1 path uses the SDK's MetaMorpho factory and throws `unknown factory` on VaultV2 vaults or V2-only chains. V2-only chains (e.g. Pharos `1672`) have no `metaMorphoFactory`.
4. **Reward `deploy` writes a placeholder** — always edit the generated `data.json` with real parameters after deployment.
5. **`reward transfer-owner` is irreversible** — double-check the target address.
6. **Blacklist validation** — `reward check` and `reward check-all-pending` validate against `chains/<chainId>/blacklist/users/data.json`. Never accept a root containing blacklisted addresses.
