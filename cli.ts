#!/usr/bin/env tsx
// vi: ft=typescript
import { Command, Option, runExit } from "clipanion";
import { writeFileSync } from "fs";
import path, { join } from "path";
import { MasterList } from "src/lib/types.js";
import { loadMarketsAndVaults } from "src/lib/load.js";
import { z } from "zod";
import { AddMarketCommand, AddVaultCommand } from "src/cmd/add.js";

class CompileCommand extends Command {
  static paths=[[`compile`]]

  dir = Option.String("--dir","chains");
  outfile = Option.String("--outfile",join("public", "masterlist.json"));

  async execute() {
    console.log(`running compile in ${this.dir}`)
    const list = await loadMarketsAndVaults(this.dir)
    console.log("markets", list.markets.size, "vaults", list.vaults.size)
    let output: z.infer<typeof MasterList> = {
      chains: {},
    }

    for (const vault of list.vaults.values()) {
      if(output.chains[vault.chainId] === undefined) {
        output.chains[vault.chainId] = {
          vaults: [],
          markets: [],
          rewardPrograms: [],
        }
      }
      output.chains[vault.chainId].vaults.push(vault)
    }
    for (const market of list.markets.values()) {
      if(output.chains[market.chainId] === undefined) {
        output.chains[market.chainId] = {
          vaults: [],
          markets: [],
          rewardPrograms: [],
        }
      }
      output.chains[market.chainId].markets.push(market)
    }
    writeFileSync(this.outfile, JSON.stringify(output, null, 2))
    console.log("wrote masterlist to", path.normalize(this.outfile))
    return 0
  }
}

runExit([
  CompileCommand,
  AddVaultCommand,
  AddMarketCommand,
])

