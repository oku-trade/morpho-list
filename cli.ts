#!/usr/bin/env tsx
import { Command, Option, runExit } from "clipanion";
import { writeFileSync } from "fs";
import path, { join } from "path";
import { loadMarketsAndVaults } from "src/common/load.js";
import { MasterList } from "src/common/types.js";
import { z } from "zod";


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
        }
      }
      output.chains[vault.chainId].vaults.push(vault)
    }
    for (const market of list.markets.values()) {
      if(output.chains[market.chainId] === undefined) {
        output.chains[market.chainId] = {
          vaults: [],
          markets: [],
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
])

