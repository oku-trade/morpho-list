import { Address, Hex, parseAbi, PublicClient, WalletClient } from "viem";

export const createRewards = async (
  client: PublicClient,
  payer: WalletClient,
  timelock: bigint,
  salt: Hex,
  factoryAddress: Address,
)=> {
  if(!payer.account) throw new Error("payer account not found")

  const {request} = await client.simulateContract({
    account: payer.account,
    address: factoryAddress,
    abi: parseAbi([`function createURD(address owner, uint256 timelock, bytes32 root, bytes32 ipfs, bytes32 salt) public returns (address)`]),
    functionName: "createURD",
    args: [
      payer.account.address,
      timelock,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt,
    ],
  })
  return await payer.writeContract(request)
}
