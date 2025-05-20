import { confirm, search } from "@inquirer/prompts";
import { Command, Option } from "clipanion";
import { loadAllData, storeData } from "src/lib/load.js";
import {
  acceptRewardRoot,
  createRewards,
  setRootUpdater,
  updateRewardRoot,
  setTimelock,
  getPendingRoot,
} from "src/lib/rewards.js";
import { getChain, getRpc, getTransport } from "src/lib/rpc.js";
import { MorphoRewardProgram } from "src/lib/types.js";
import { isNumber } from "util";
import {
  createWalletClient,
  getAddress,
  Hex,
  isAddress,
  isHash,
  keccak256,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const prodPublisher = "0xCa3D836E100Aca076991bF9abaA4F7516e5155Cb";
const devPublishers = [
  "0xA8F5d96E2DDfb5ec3F24B960A5a44EbC620064A3",
  "0xbF56E691851FdbEa83C670Cb365c2c1AFA1E58ca",
  "0xe4306ad21A29f9EdcfA9fA584e379A8D0D1463BB",
];
const selectReward = async (dir: string, id: string | undefined) => {
  const rewards = await loadAllData(dir, "rewards");
  const reward =
    id === undefined
      ? await search({
        message: "Select a reward program to set timelock for",
        source: async (input) => {
          return rewards
            .filter((r) => r.id.includes(input || ""))
            .map((r) => ({
              name: `${r.id} - (${r.name})`,
              value: r,
            }));
        },
      })
      : rewards.find((r) => r.id === id);
  return { reward, rewards };
};

const getWalletInfo = (chainString: string | number) => {
  const chain = getChain(chainString);
  if (!("urdFactory" in chain.morpho)) {
    throw new Error(`No urdFactory for chain ${chain.id}`);
  }
  const publicClient = getRpc(chain.id);
  const transport = getTransport(chain.id);
  const private_key = process.env.ETHEREUM_PRIVATE_KEY;
  if (!private_key) {
    throw new Error("No private key found. set ETHEREUM_PRIVATE_KEY env var");
  }
  const account = privateKeyToAccount(private_key as Hex);
  const walletClient = createWalletClient({
    account,
    transport,
  });
  return { publicClient, walletClient, account, chain };
};

export class CreateRewardsCommand extends Command {
  static paths = [["reward", "deploy"]];

  chain = Option.String();
  id = Option.String();
  hashPrefix = Option.String("--hash-prefix", "oku:v0.0.0");
  dir = Option.String("--dir", "chains");

  prod = Option.Boolean("--prod", false);

  async execute() {
    const { chain, publicClient, walletClient } = getWalletInfo(this.chain);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }

    // load all the rewards to make sure the id is not a duplicate
    const rewards = await loadAllData(this.dir, "rewards");
    const rewardIds = new Set(rewards.map((r) => r.id));
    if (rewardIds.has(this.id)) {
      throw new Error(`Reward id ${this.id} already exists. try 'reward list'`);
    }

    const saltHash = keccak256(toHex(`${this.hashPrefix}:${this.id}`));
    let timelock = 0;
    if (this.prod) {
      timelock = 5 * 24 * 60 * 60;
    }

    const urdAddress = await createRewards(
      publicClient,
      walletClient,
      BigInt(timelock),
      saltHash,
      chain.morpho.urdFactory,
    );
    if (this.prod) {
      //// ended here
      const txnhash = await setRootUpdater(
        publicClient,
        walletClient,
        getAddress(urdAddress),
        getAddress(prodPublisher),
        true,
      );
      console.log(
        `set prod publisher ${prodPublisher} for urd ${urdAddress}. txn hash: ${txnhash}`,
      );
      // TODO: ownership transfer to the multisig
    } else {
      for (const devPublisher of devPublishers) {
        const txnSetDevPublisher = await setRootUpdater(
          publicClient,
          walletClient,
          getAddress(urdAddress),
          getAddress(devPublisher),
          true,
        );
        console.log(
          `set dev publisher ${devPublisher} for urd ${urdAddress}. txn hash: ${txnSetDevPublisher}`,
        );
      }
      if (!devPublishers.includes(walletClient.account.address)) {
        const txnSetOwnerPublisher = await setRootUpdater(
          publicClient,
          walletClient,
          getAddress(urdAddress),
          getAddress(walletClient.account.address),
          true,
        );
        console.log(
          `set owner publisher ${walletClient.account.address} for urd ${urdAddress}. txn hash: ${txnSetOwnerPublisher}`,
        );
      }
    }
    //
    console.log(`deployed a new urd to ${urdAddress}`);
    let rewardProgram: z.infer<typeof MorphoRewardProgram> = {
      id: this.id,
      salt: saltHash,
      urdAddress: urdAddress.toLowerCase(),
      chainId: chain.id,
      start_timestamp: 1747756800,
      end_timestamp: 1748966400,
      production: this.prod,
      reward_amount: "31229205500000000000000",
      reward_token: "0x9Cf9F00F3498c2ac856097087e041523dfdD71fF",
      name: this.id,
      type: "market",
      market:
        "0x2547ba491a7ff9e8cfcaa3e1c0da739f4fdc1be9fe4a37bfcdf570002153a0de",
    };
    const writtenFile = storeData(
      this.dir,
      chain.id.toString(),
      "rewards",
      rewardProgram.id,
      rewardProgram,
    );
    console.log(
      `wrote placeholder campaign to ${writtenFile}. please edit it/update it`,
    );
  }
}

export class ListRewardPrograms extends Command {
  static paths = [["reward", "list"]];

  dir = Option.String("--dir", "chains");
  root = Option.String("--root");
  async execute() {
    const rewards = await loadAllData(this.dir, "rewards");
    for (const reward of rewards) {
      console.log(
        `${reward.id}: (${reward.chainId}) ${reward.reward_amount} https://maizenet-explorer.usecorn.com/address/${reward.urdAddress}`,
      );
    }
  }
}

export class AcceptRewardRoot extends Command {
  static paths = [["reward", "accept"]];
  id = Option.String({ required: false });
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id);
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }
    const txnhash = await acceptRewardRoot(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
    );
    console.log(
      `updated root for urd ${reward.urdAddress}. txn hash: ${txnhash}`,
    );
  }
}
export class UpdateRewardRoot extends Command {
  static paths = [["reward", "update"]];

  id = Option.String({ required: false });
  root = Option.String();
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id);
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }

    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }
    if (!this.root || !isHash(this.root)) {
      throw new Error("root must be a hash");
    }
    const txnhash = await updateRewardRoot(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      this.root,
    );
    console.log(
      `updated root for urd ${reward.urdAddress} to ${this.root}. txn hash: ${txnhash}`,
    );
  }
}

export class AddRewardPublisher extends Command {
  static paths = [["reward", "add-publisher"]];

  id = Option.String({
    required: false,
  });
  publisher = Option.String();
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id);
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { publicClient, walletClient } = getWalletInfo(reward.chainId);
    if (!this.publisher || !isAddress(this.publisher)) {
      throw new Error("publisher must be an address");
    }
    const txnhash = await setRootUpdater(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      getAddress(this.publisher),
      true,
    );
    console.log(
      `added publisher ${this.publisher} to urd ${reward.urdAddress}. txn hash: ${txnhash}`,
    );
  }
}

export class SetTimelock extends Command {
  static paths = [["reward", "set-timelock"]];

  id = Option.String({
    required: false,
  });
  // 16 hours
  timelock = Option.String("--timelock", "57600");
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id);
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);

    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }
    if (!this.timelock || isNaN(Number(this.timelock))) {
      throw new Error("timelock must be a number");
    }
    const txnhash = await setTimelock(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      BigInt(this.timelock),
    );
    console.log(
      `updated timelock for urd ${reward.urdAddress} to ${this.timelock}. txn hash: ${txnhash}`,
    );
  }
}

export class RepublishRoot extends Command {
  static paths = [["reward", "republish-root"]];
  id = Option.String({
    required: false,
  });
  dir = Option.String("--dir", "chains");
  async execute() {
    const { reward } = await selectReward(this.dir, this.id);
    if (!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`);
    }
    const { chain, publicClient, walletClient } = getWalletInfo(reward.chainId);
    if (!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}.'`);
    }

    const pendingRoot = await getPendingRoot(
      publicClient,
      getAddress(reward.urdAddress),
    );
    const answer = await confirm({
      message: `Are you sure you want to republish the root for urd ${reward.urdAddress}? The pending root is ${pendingRoot}`,
    });
    if (!answer) {
      console.log("aborting");
      return;
    }
    const txnhash = await updateRewardRoot(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      pendingRoot,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    );
    console.log(
      `republished root for urd ${reward.urdAddress}. txn hash: ${txnhash}`,
    );
  }
}
