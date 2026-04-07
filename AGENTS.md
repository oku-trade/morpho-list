# AGENTS.md

## What this repo is

Filesystem-based registry of Morpho protocol vaults, markets, rewards, and blacklists. Data lives under `chains/<chainId>/{vaults,markets,rewards,blacklist}/<key>/data.json`. A `compile` step aggregates everything into `public/masterlist.json`.

## Adding vaults and markets

**Always use the CLI. Never create `data.json` files by hand.**

```bash
yarn tsx cli.ts add vault <chain> <vault-address>
yarn tsx cli.ts add market <chain> <market-id>
```

- `<chain>` is the `internalName` from `@gfxlabs/oku-chains` (e.g. `ethereum`, `base`, `polygon`) or a numeric chain ID.
- `add vault` fetches on-chain data via Morpho SDK, writes the vault entry, then automatically adds all associated markets (`--with-markets` defaults to true).
- The CLI checksums addresses via viem's `getAddress()` — folder names use mixed-case checksummed addresses, not all-lowercase.
- Use `--force` to overwrite existing entries.
- Morpho v2 vaults will fail with `Contract Function Execution Error: Execution reverted` because the SDK only supports v1 vault ABIs. Skip these.

## Compiling the masterlist

```bash
yarn compile
# or equivalently:
make list
```

This reads all `data.json` files, validates them with Zod schemas, checks for duplicates, and writes `public/masterlist.json`. **Never edit `masterlist.json` directly** — it is always regenerated.

## Pre-commit hook

`.husky/pre-commit` runs `corepack yarn compile` and auto-commits any `masterlist.json` changes. This means every commit triggers a recompile.

## CI

On push to `main`, `.github/workflows/generate_list.yml` runs `make list` and commits updated `masterlist.json` with `[skip ci]` to avoid loops.

## Environment

Requires a `.env` file with `VENN_URL` pointing to an RPC gateway. The RPC URL is constructed as `${VENN_URL}/<chain-internalName>`. The `ETHEREUM_PRIVATE_KEY` in `.env` is only used by reward commands that sign transactions.

## Data schemas (`src/lib/types.ts`)

- Addresses: lowercase 40-char hex (`^0x[a-f0-9]{40}$`)
- Hashes/market IDs: lowercase 64-char hex (`^0x[a-f0-9]{64}$`)
- `performanceFeePercentage`, `lltvPercent`, `liquidationPenalty`: numeric strings (raw 18-decimal values, not human percentages)

All reads and writes go through Zod validation in `src/lib/load.ts`.

## Key directories

- `cli.ts` — entrypoint, defines `CompileCommand` and wires up sub-commands
- `src/cmd/add.ts` — `AddVaultCommand`, `AddMarketCommand`
- `src/cmd/rewards.ts` — reward program management (deploy, update, accept roots)
- `src/lib/read_chain.ts` — on-chain data fetching via Morpho SDK
- `src/lib/rpc.ts` — RPC client creation, chain resolution
- `src/inject.ts` — registers custom chains not in the Morpho SDK (Corn, Sei, World Chain, etc.)
- `src/data/vault_addresses.ts` — hardcoded reference vault lists for initial seeding

## Supported chains

Determined by `MAINNET_CHAINS` from `@gfxlabs/oku-chains`. Current chain dirs: `1` (Ethereum), `8453` (Base), `480` (World Chain), `1329` (Sei), `10` (Optimism), `42793` (Etherlink), `16661`, `21000000` (Corn). New chain dirs (e.g. `137` for Polygon) are created automatically by the CLI.
