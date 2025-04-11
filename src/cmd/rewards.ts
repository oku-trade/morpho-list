import { Command, Option} from "clipanion";
import { loadAllData } from "src/lib/load.js";
import { createRewards, updateRewardRoot } from "src/lib/rewards.js";
import { getChain, getRpc, getTransport } from "src/lib/rpc.js";
import { Address, createWalletClient, getAddress, Hex, isHash, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export class CreateRewardsCommand  extends Command {
  static paths = [["reward", "deploy"]];

  chain = Option.String();
  dir = Option.String("--dir","chains");
  salt = Option.String("--salt","oku");

  async execute() {
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
    const saltHash = keccak256(toHex(this.salt));
    const timelock = 0;
    const urdAddress = await createRewards(
      publicClient,
      walletClient,
      BigInt(timelock),
      saltHash,
      chain.morpho.urdFactory,
    )
    console.log(`deployed a new urd to ${urdAddress}`)
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
