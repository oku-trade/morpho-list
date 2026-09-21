# AGENTS.md

## Adding vaults and markets

Before adding vaults or markets, read the [`morpho-cli` skill](.agents/skills/morpho-cli/SKILL.md).

Run only the CLI commands needed for the requested additions:

```bash
yarn tsx cli.ts add vault <chain> <vault-address>
yarn tsx cli.ts add vault <chain> <vault-address> --version 2
yarn tsx cli.ts add market <chain> <market-id>
```

- `<chain>` is a chain name (e.g. `ethereum`, `base`, `polygon`) or numeric chain ID.
- Vaults default to v1 (MetaMorpho). For VaultV2 vaults, use `--version 2`, not `--v2`. If the default path fails with `unknown factory`, retry with `--version 2` (required on V2-only chains such as Pharos).
- Adding a vault automatically adds its associated markets.
- Never create or edit `data.json` files by hand. Include only the CLI-generated entries under `chains/` in the PR.
- Stop after the requested additions. Do not run compilation or make unrelated changes.

## Masterlist: CI only

**If a PR includes edits to `public/masterlist.json`, the task was completed incorrectly.**

- Never edit, generate, stage, or commit `public/masterlist.json`.
- Never run `yarn compile`, `corepack yarn compile`, `make list`, or any equivalent compile command, including for validation.
- CI regenerates the masterlist after merge to the default branch. Generating it locally causes PR conflicts.
- The pre-commit hook runs compilation and auto-commits changes. Bypass it when committing with `git -c core.hooksPath=/dev/null commit ...`.
- Before submitting, check the PR diff. It must contain no masterlist changes.
