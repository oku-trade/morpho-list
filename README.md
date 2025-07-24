# morpho-list

A CLI tool for managing Morpho vaults and markets.

## Installation

```bash
yarn install
```

## Usage

### Adding a Vault

To add a vault to the list, use the following command:

```bash
yarn tsx cli.ts add vault <chain> <vault-address>
```

Example:
```bash
yarn tsx cli.ts add vault ethereum 0x777791C4d6DC2CE140D00D2828a7C93503c67777
```

This command will:
1. Fetch the vault configuration from the blockchain
2. Retrieve all associated markets for the vault
3. Add any new markets to the local configuration
4. Save the vault and market data

Note: If a market already exists, the CLI will notify you. Use `--force` flag to overwrite existing markets if needed.
