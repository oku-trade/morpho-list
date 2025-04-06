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
  const deployed = await payer.writeContract(request)
  // add owner to root updaters
  const {request: request2} = await client.simulateContract({
    account: payer.account,
    address: deployed,
    abi: parseAbi([`function setRootUpdater(address rootUpdater, bool active) external`]),
    functionName: "setRootUpdater",
    args: [payer.account.address, true],
  })
  await payer.writeContract(request2)
  return deployed
}
