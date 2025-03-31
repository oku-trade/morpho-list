import { Command, Option} from "clipanion";
import { createRewards } from "src/lib/rewards.js";
import { getChain, getRpc, getTransport } from "src/lib/rpc.js";
import { createWalletClient, Hex, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export class CreateRewardsCommand  extends Command {
  static paths = [["deploy urd"]];

  chain = Option.String();
  id = Option.String();
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
    // 5 day timelock, in seconds
    const timelock = 60 * 60 * 24 * 5;
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
