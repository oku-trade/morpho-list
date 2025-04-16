#!/usr/bin/env tsx
// vi: ft=typescript
import { Command, Option, runExit } from "clipanion";
import { writeFileSync } from "fs";
import path, { join } from "path";
import { MasterList } from "src/lib/types.js";
import { loadAllData } from "src/lib/load.js";
import { z } from "zod";
import { AddMarketCommand, AddVaultCommand } from "src/cmd/add.js";
import { AcceptRewardRoot, AddRewardPublisher, CreateRewardsCommand, ListRewardPrograms, UpdateRewardRoot } from "src/cmd/rewards.js";

import * as rawRewardCommands from "src/cmd/rewards.js";

const rewardCommmands = Object.values(rawRewardCommands)

class CompileCommand extends Command {
  static paths = [[`compile`]];

  dir = Option.String("--dir", "chains");
  outfile = Option.String("--outfile", join("public", "masterlist.json"));

  async execute() {
    console.log(`running compile in ${this.dir}`);

    const markets = await loadAllData(this.dir, "markets");
    const vaults = await loadAllData(this.dir, "vaults");
    const rewards = await loadAllData(this.dir, "rewards");
    const blacklists = await loadAllData(this.dir, "blacklist");

    console.log(
      "markets", markets.length,
      "vaults", vaults.length,
      "rewards", rewards.length,
      "blacklists", blacklists.length
    );

    let output: z.infer<typeof MasterList> = {
      chains: {},
    };

    const ensureChain = (chainId: number) => {
      if (output.chains[chainId] === undefined) {
        output.chains[chainId] = {
          vaults: [],
          markets: [],
          rewards: [],
          blacklist: [],
        };
      }
    };

    let seen = new Set<string>();
    const checkSeen = (key: string) => {
      if (seen.has(key)) {
        throw new Error(`Duplicate key ${key} (reward programs must be unique across chains)`);
      }
      seen.add(key);
    };

    for (const vault of vaults) {
      ensureChain(vault.chainId);
      checkSeen(`${vault.chainId}_${vault.vaultAddress}`);
      output.chains[vault.chainId].vaults.push(vault);
    }

    for (const market of markets) {
      ensureChain(market.chainId);
      checkSeen(`${market.chainId}_${market.marketId}`);
      output.chains[market.chainId].markets.push(market);
    }

    for (const rewardProgram of rewards) {
      ensureChain(rewardProgram.chainId);
      checkSeen(`${rewardProgram.id}`);
      output.chains[rewardProgram.chainId].rewards.push(rewardProgram);
    }

    for (const blacklist of blacklists) {
      ensureChain(blacklist.chainId);
      output.chains[blacklist.chainId].blacklist = blacklist.blacklist;
    }

    writeFileSync(this.outfile, JSON.stringify(output, null, 2));
    console.log("wrote masterlist to", path.normalize(this.outfile));
    return 0;
  }
}

runExit([
  CompileCommand,
  AddVaultCommand,
  AddMarketCommand,
  ...rewardCommmands
])
