import { loadMarket, loadVault, storeData } from "src/lib/load.js";
import { Command, Option} from "clipanion";
import { MAINNET_CHAINS } from "@gfxlabs/oku-chains";
import { MarketId } from "@morpho-org/blue-sdk";
import { getMarketById, getVaultByAddress } from "src/lib/read_chain.js";
import { getAddress } from "viem";
import { getChainId } from "src/lib/rpc.js";



export class AddVaultCommand extends Command {
  static paths=[[`add`,`vault`]]

  chain = Option.String();
  vault = Option.String();

  force = Option.Boolean("--force", false);
  dir = Option.String("--dir","chains");
  withMarkets = Option.Boolean("--with-markets", true);

  async execute() {
    const chainId = getChainId(this.chain);
    // see if the vault is an address
    const addr = getAddress(this.vault)
    if(!this.force) {
      // see if we already have the vault
      try {
        await loadVault(this.dir, chainId.toString(), addr)
        console.log(`skipping vault ${chainId}/${addr} as it already exists. use --force to overwrite`)
        return 2
      } catch(e) {
        if(!(e instanceof Error && e.message.includes("no such file"))) {
          throw e
        }
      }
    }
    // now get the vault
    const vaultInfo = await getVaultByAddress(chainId, addr)
    storeData(this.dir, chainId.toString(), "vaults", addr, vaultInfo.entry)

    // now get the markets
    if(this.withMarkets) {
      const markets = vaultInfo.markets
      for (const market of markets) {
        const cmd = new AddMarketCommand()
        cmd.chain = this.chain
        cmd.market = market
        cmd.dir = this.dir
        cmd.force = false
        await cmd.execute()
      }
    }
  }
}

export class AddMarketCommand extends Command {
  static paths=[[`add`,`market`]]

  chain = Option.String();
  market = Option.String();

  force = Option.Boolean("--force", false);
  dir = Option.String("--dir","chains");

  async execute() {
    var chainId: number
    if(!isNaN(parseInt(this.chain))) {
      chainId = parseInt(this.chain)
    }else {
      const foundChain = MAINNET_CHAINS.find(c => c.internalName === this.chain)
      if(!foundChain) {
        throw new Error(`chain ${this.chain} not found`)
      }
      chainId = foundChain.id
    }

    if(!(this.market.startsWith("0x") && this.market.length == 66)){
      throw new Error(`${this.market} is not a valid market id`)
    }
    // see if the vault is a market id
    const marketId = this.market as MarketId
    if(!this.force) {
      // see if we already have the vault
      try {
        await loadMarket(this.dir, chainId.toString(), marketId)
        console.log(`market ${chainId}/${marketId} already exists. \`cli add market --force\` to overwrite`)
        return 0
      } catch(e) {
        if(!(e instanceof Error && e.message.includes("no such file"))) {
          throw e
        }
      }
    }
    // now get the market
    const marketInfo = await getMarketById(chainId, marketId)
    storeData(this.dir, chainId.toString(), "markets", marketId, marketInfo.entry)
  }
}

