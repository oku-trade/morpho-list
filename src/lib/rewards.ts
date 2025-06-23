import { Address, decodeAbiParameters, Hex, parseAbi, PublicClient, WalletClient, zeroHash } from "viem";

export const setTimelock = async (
  client: PublicClient,
  payer: WalletClient,
  urdAddress: Address,
  timelock: bigint,
) => {
  if(!payer.account) throw new Error("payer account not found")

  const {request} = await client.simulateContract({
    account: payer.account,
    address: urdAddress,
    abi: parseAbi([`function setTimelock(uint256 timelock) external`]),
    functionName: "setTimelock",
    args: [
      timelock,
    ],
  })
  const txn = await payer.writeContract(request)
  await client.waitForTransactionReceipt({hash: txn})
  return txn
}

export const setRootUpdater = async (
  client: PublicClient,
  payer: WalletClient,
  urdAddress: Address,
  publisher: Address,
  status: boolean,
) => {
  if(!payer.account) throw new Error("payer account not found")

  const {request} = await client.simulateContract({
    account: payer.account,
    address: urdAddress,
    abi: parseAbi([`function setRootUpdater(address publisher, bool active) external`]),
    functionName: "setRootUpdater",
    args: [
      publisher, status
    ],
  })
  const txn = await payer.writeContract(request)
  await client.waitForTransactionReceipt({hash: txn})
  return txn
}

export const getPendingRoot = async (
  client: PublicClient,
  urdAddress: Address,
) => {
  const result = await client.readContract({
    address: urdAddress,
    abi: parseAbi([`function pendingRoot() external view returns ((bytes32,bytes32,uint256))`]),
    functionName: "pendingRoot",
    args: [],
  })
  return result[0]
}

export const getPendingRootWithTimestamp = async (
  client: PublicClient,
  urdAddress: Address,
) => {
  const result = await client.readContract({
    address: urdAddress,
    abi: parseAbi([`function pendingRoot() external view returns ((bytes32,bytes32,uint256))`]),
    functionName: "pendingRoot",
    args: [],
  })
  return {
    root: result[0],
    ipfs: result[1],
    timestamp: result[2]
  }
}

export const getTimelock = async (
  client: PublicClient,
  urdAddress: Address,
) => {
  const result = await client.readContract({
    address: urdAddress,
    abi: parseAbi([`function timelock() external view returns (uint256)`]),
    functionName: "timelock",
    args: [],
  })
  return result
}

export const getOwner = async (
  client: PublicClient,
  urdAddress: Address,
) => {
  const result = await client.readContract({
    address: urdAddress,
    abi: parseAbi([`function owner() external view returns (address)`]),
    functionName: "owner",
    args: [],
  })
  return result
}

export const updateRewardRoot = async (
  client: PublicClient,
  payer: WalletClient,
  urdAddress: Address,
  newRoot: Hex,
  newIpfs: Hex = zeroHash,
) => {
  if(!payer.account) throw new Error("payer account not found")

  const {request} = await client.simulateContract({
    account: payer.account,
    address: urdAddress,
    abi: parseAbi([`function setRoot(bytes32 root, bytes32 ipfs) external`]),
    functionName: "setRoot",
    args: [
      newRoot,
      newIpfs,
    ],
  })
  const txn = await payer.writeContract(request)
  await client.waitForTransactionReceipt({hash: txn})
  return txn
}
export const acceptRewardRoot = async (
  client: PublicClient,
  payer: WalletClient,
  urdAddress: Address,
) => {
  if(!payer.account) throw new Error("payer account not found")

  const {request} = await client.simulateContract({
    account: payer.account,
    address: urdAddress,
    abi: parseAbi([`function acceptRoot() external`]),
    functionName: "acceptRoot",
    args: [],
  })
  const txn = await payer.writeContract(request)
  await client.waitForTransactionReceipt({hash: txn})
  return txn
}

export const transferOwnership = async (
  client: PublicClient,
  payer: WalletClient,
  urdAddress: Address,
  newOwner: Address,
) => {
  if(!payer.account) throw new Error("payer account not found")

  const {request} = await client.simulateContract({
    account: payer.account,
    address: urdAddress,
    abi: parseAbi([`function setOwner(address newOwner) external`]),
    functionName: "setOwner",
    args: [newOwner],
  })
  const txn = await payer.writeContract(request)
  await client.waitForTransactionReceipt({hash: txn})
  return txn
}

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
    abi: parseAbi([`function createUrd(address owner, uint256 timelock, bytes32 root, bytes32 ipfs, bytes32 salt) public returns (address)`]),
    functionName: "createUrd",
    args: [
      payer.account.address,
      timelock,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      salt,
    ],
  })

  const deployed = await payer.writeContract(request)

  // get the receipts for this txn hash
  const receipts = await client.waitForTransactionReceipt({hash: deployed})

  const relevantLog = receipts.logs.find(log => log.topics[0] === "0xb08f131b4d26f626f4bd2fa639786c2b37988240728dcb975897a27ddc87ddb2")
  if(!relevantLog) {
    throw new Error("Could not find relevant log. failed to deploy contract?")
  }
  const relevantTopic = relevantLog.topics[1]
  if(!relevantTopic) {
    throw new Error("Could not find relevant topic. failed to deploy contract?")
  }
  const [deployedAddress] = decodeAbiParameters([{type:'address'}], relevantTopic)
  console.log("deployed urd to address", deployedAddress)

  return deployedAddress
}
