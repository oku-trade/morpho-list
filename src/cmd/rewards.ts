import { Command, Option} from "clipanion";
import { loadAllData, storeData } from "src/lib/load.js";
import { acceptRewardRoot, createRewards, setRootUpdater, updateRewardRoot } from "src/lib/rewards.js";
import { getChain, getRpc, getTransport } from "src/lib/rpc.js";
import { MorphoRewardProgram } from "src/lib/types.js";
import { Address, createWalletClient, getAddress, Hex, isAddress, isHash, keccak256, toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const prodPublisher = "0xCa3D836E100Aca076991bF9abaA4F7516e5155Cb"
const devPublisher = "0xA8F5d96E2DDfb5ec3F24B960A5a44EbC620064A3"

export class CreateRewardsCommand  extends Command {
  static paths = [["reward", "deploy"]];

  chain = Option.String();
  id = Option.String();
  hashPrefix = Option.String("--hash-prefix", "oku:v0.0.0");
  dir = Option.String("--dir","chains");

  prod = Option.Boolean("--prod", false);

  async execute() {

    // load all the rewards to make sure the id is not a duplicate
    const rewards = await loadAllData(this.dir, "rewards")
    const rewardIds = new Set(rewards.map(r => r.id))


    if(rewardIds.has(this.id)) {
      throw new Error(`Reward id ${this.id} already exists. try 'reward list'`)
    }

    const chain = getChain(this.chain);
    if(!("urdFactory" in chain.morpho)) {
      throw new Error(`No urdFactory for chain ${chain.id}`)
    }
    const publicClient = getRpc(chain.id);
    const transport = getTransport(chain.id);
    const private_key = process.env.ETHEREUM_PRIVATE_KEY;
    if(!private_key) {
      throw new Error("No private key found. set ETHEREUM_PRIVATE_KEY env var")
    }
    const account = privateKeyToAccount(private_key as Hex);
    const walletClient = createWalletClient({
      account,
      transport,
    })
    const saltHash = keccak256(toHex(`${this.hashPrefix}:${this.id}`));
    const timelock = 0;
    const urdAddress = await createRewards(
      publicClient,
      walletClient,
      BigInt(timelock),
      saltHash,
      chain.morpho.urdFactory,
    )
    if(this.prod) {
      //// ended here
      const txnhash = await setRootUpdater(
        publicClient,
        walletClient,
        getAddress(urdAddress),
        getAddress(prodPublisher),
        true,
      )
      console.log(`set prod publisher ${prodPublisher} for urd ${urdAddress}. txn hash: ${txnhash}`)
      // TODO: ownership transfer to the multisig
    } else {
      const txnSetDevPublisher= await setRootUpdater(
        publicClient,
        walletClient,
        getAddress(urdAddress),
        getAddress(devPublisher),
        true,
      )
      console.log(`set dev publisher ${devPublisher} for urd ${urdAddress}. txn hash: ${txnSetDevPublisher}`)
      const txnSetOwnerPublisher= await setRootUpdater(
        publicClient,
        walletClient,
        getAddress(urdAddress),
        getAddress(walletClient.account.address),
        true,
      )
      console.log(`set owner publisher ${walletClient.account.address} for urd ${urdAddress}. txn hash: ${txnSetOwnerPublisher}`)
    }
    //
    console.log(`deployed a new urd to ${urdAddress}`)
    let rewardProgram: z.infer<typeof MorphoRewardProgram> =  {
      id: this.id,
      salt: saltHash,
      urdAddress: urdAddress.toLowerCase(),
      chainId: chain.id,
      start_timestamp: 0,
      end_timestamp: 0,
      production: this.prod,
      reward_amount: "0",
      reward_token: zeroAddress,
      name: this.id,
      type: "vault",
      vault: zeroAddress,
    }
    const writtenFile = storeData(this.dir, chain.id.toString(), "rewards", rewardProgram.id, rewardProgram)
    console.log(`wrote placeholder campaign to ${writtenFile}. please edit it/update it`)
  }
}


export class ListRewardPrograms extends Command {
  static paths = [["reward", "list"]];

  dir = Option.String("--dir","chains");
  root = Option.String("--root");
  async execute() {
    const rewards = await loadAllData(this.dir, "rewards")
    for(const reward of rewards) {
      console.log(reward.chainId, reward.id)
    }
  }
}

export class AcceptRewardRoot extends Command {
  static paths = [["reward", "accept"]];
  id = Option.String();
  dir = Option.String("--dir","chains");
  async execute() {
    const rewards = await loadAllData(this.dir, "rewards")
    const reward = rewards.find(r => r.id === this.id)
    if(!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`)
    }
    const chain = getChain(`${reward.chainId}`);
    const publicClient = getRpc(chain.id);
    const transport = getTransport(chain.id);
    const private_key = process.env.ETHEREUM_PRIVATE_KEY;
    if(!private_key) {
      throw new Error("No private key found. set ETHEREUM_PRIVATE_KEY env var")
    }
    const account = privateKeyToAccount(private_key as Hex);
    const walletClient = createWalletClient({
      account,
      transport,
    })
    const txnhash = await acceptRewardRoot(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
    )
    console.log(`updated root for urd ${reward.urdAddress}. txn hash: ${txnhash}`)

  }
}
export class UpdateRewardRoot extends Command {
  static paths = [["reward", "update"]];

  id = Option.String();
  root = Option.String();
  dir = Option.String("--dir","chains");
  async execute() {
    const rewards = await loadAllData(this.dir, "rewards")
    const reward = rewards.find(r => r.id === this.id)
    if(!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`)
    }
    const chain = getChain(`${reward.chainId}`);
    const publicClient = getRpc(chain.id);
    const transport = getTransport(chain.id);
    const private_key = process.env.ETHEREUM_PRIVATE_KEY;
    if(!private_key) {
      throw new Error("No private key found. set ETHEREUM_PRIVATE_KEY env var")
    }
    const account = privateKeyToAccount(private_key as Hex);
    const walletClient = createWalletClient({
      account,
      transport,
    })
    if(!this.root || !isHash(this.root)) {
      throw new Error("root must be a hash")
    }
    const txnhash = await updateRewardRoot(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      this.root,
    )
    console.log(`updated root for urd ${reward.urdAddress} to ${this.root}. txn hash: ${txnhash}`)
  }
}

export class AddRewardPublisher extends Command {
  static paths = [["reward", "add-publisher"]];

  id = Option.String();
  publisher = Option.String();
  dir = Option.String("--dir","chains");
  async execute() {
    const rewards = await loadAllData(this.dir, "rewards")
    const reward = rewards.find(r => r.id === this.id)
    if(!reward) {
      throw new Error(`reward ${this.id} not found. try 'reward list'`)
    }
    const chain = getChain(`${reward.chainId}`);
    const publicClient = getRpc(chain.id);
    const transport = getTransport(chain.id);
    const private_key = process.env.ETHEREUM_PRIVATE_KEY;
    if(!private_key) {
      throw new Error("No private key found. set ETHEREUM_PRIVATE_KEY env var")
    }
    const account = privateKeyToAccount(private_key as Hex);
    const walletClient = createWalletClient({
      account,
      transport,
    })
    if(!this.publisher || !isAddress(this.publisher)) {
      throw new Error("publisher must be an address")
    }
    const txnhash = await setRootUpdater(
      publicClient,
      walletClient,
      getAddress(reward.urdAddress),
      getAddress(this.publisher),
      true,
    )
    console.log(`added publisher ${this.publisher} to urd ${reward.urdAddress}. txn hash: ${txnhash}`)
  }
}
