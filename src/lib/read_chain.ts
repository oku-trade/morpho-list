import "../inject.js"
import { fetchAccrualVault, fetchMarketParams, fetchVault, fetchVaultConfig } from "@morpho-org/blue-sdk-viem";
import { getRpc, getTransport } from "./rpc.js"
import { typecheck } from "src/lib/utils.js";
import { MorphoMarket, MorphoVault } from "src/lib/types.js";
import { Address, zeroAddress, createPublicClient, getAddress } from "viem";
import { MarketId } from "@morpho-org/blue-sdk";

const vaultV2Abi = [
  { type: "function", name: "asset", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "performanceFee", inputs: [], outputs: [{ type: "uint96" }], stateMutability: "view" },
  { type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "curator", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "adaptersLength", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "adapters", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
] as const

const morphoMarketV1AdapterV2Abi = [
  { type: "function", name: "marketIdsLength", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "marketIds", inputs: [{ type: "uint256" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
] as const

const morphoVaultV1AdapterAbi = [
  { type: "function", name: "morphoVaultV1", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
] as const

export const getVaultByAddress = async (chain: number, address: Address, version: number = 1) => {
  if (version === 2) {
    return getVaultV2ByAddress(chain, address)
  }
  return getVaultV1ByAddress(chain, address)
}

const getVaultV1ByAddress = async (chain: number, address: Address) => {
  const pc = getRpc(chain);
  const vaultAccural = await fetchAccrualVault(address, pc)
  const vaultMarkets = Array.from(vaultAccural.allocations.keys())

  const vaultConfig = await fetchVaultConfig(address, pc)
  const vaultLive = await fetchVault(address, pc)

  console.log("got vault config", vaultConfig, vaultMarkets, vaultLive)

  // try to create an entry now
  let entry = await typecheck(MorphoVault, {
    enabled: true,
    vaultAddress: address,
    chainId: Number(chain),
    tokenAddress: vaultConfig.asset,
    curatorAddress: vaultLive.curator,
    guardianAddress: vaultLive.guardian,
    performanceFeePercentage: vaultLive.fee.toString(),
    name: vaultConfig.name,
  })
  return {
    address,
    chain,
    entry,
    markets: vaultMarkets,
  }
}

const getVaultV2ByAddress = async (chain: number, address: Address) => {
  const pc = createPublicClient({ transport: getTransport(chain) })

  const [asset, name, performanceFee, curator] = await Promise.all([
    pc.readContract({ address, abi: vaultV2Abi, functionName: "asset" }),
    pc.readContract({ address, abi: vaultV2Abi, functionName: "name" }),
    pc.readContract({ address, abi: vaultV2Abi, functionName: "performanceFee" }),
    pc.readContract({ address, abi: vaultV2Abi, functionName: "curator" }),
  ])

  console.log("got v2 vault", { address, asset, name, performanceFee, curator })

  // Collect market IDs and wrapped V1 vault addresses from all adapters
  const adaptersLength = await pc.readContract({ address, abi: vaultV2Abi, functionName: "adaptersLength" })
  const markets: MarketId[] = []
  const wrappedV1Vaults: Address[] = []

  for (let i = 0n; i < adaptersLength; i++) {
    const adapterAddr = await pc.readContract({ address, abi: vaultV2Abi, functionName: "adapters", args: [i] })
    // Try MorphoMarketV1AdapterV2 — has marketIdsLength/marketIds
    try {
      const marketIdsLength = await pc.readContract({ address: adapterAddr, abi: morphoMarketV1AdapterV2Abi, functionName: "marketIdsLength" })
      for (let j = 0n; j < marketIdsLength; j++) {
        const marketId = await pc.readContract({ address: adapterAddr, abi: morphoMarketV1AdapterV2Abi, functionName: "marketIds", args: [j] })
        markets.push(marketId as MarketId)
      }
      continue
    } catch {
      // Not a MorphoMarketV1AdapterV2
    }
    // Try MorphoVaultV1Adapter — wraps a V1 vault
    try {
      const wrappedVault = await pc.readContract({ address: adapterAddr, abi: morphoVaultV1AdapterAbi, functionName: "morphoVaultV1" })
      if (wrappedVault !== zeroAddress) {
        wrappedV1Vaults.push(getAddress(wrappedVault))
        console.log(`  adapter ${adapterAddr} wraps V1 vault ${wrappedVault}`)
      }
    } catch {
      // Unknown adapter type
    }
  }

  let entry = await typecheck(MorphoVault, {
    enabled: true,
    vaultAddress: address,
    chainId: Number(chain),
    tokenAddress: getAddress(asset),
    curatorAddress: getAddress(curator),
    performanceFeePercentage: performanceFee.toString(),
    name: name,
    version: 2,
  })

  return {
    address,
    chain,
    entry,
    markets,
    wrappedV1Vaults,
  }
}

export const getMarketById = async (chain: number, id: MarketId) => {
  const pc = getRpc(chain);
  const marketConfig = await fetchMarketParams(id , pc)
  console.log("got market config", marketConfig)
  if(marketConfig.loanToken === zeroAddress) {
    throw new Error(`the zero address is not a valid loan token for a market`)
  }
  // try to create an entry now
  let entry = await typecheck(MorphoMarket, {
    enabled: true,
    chainId: Number(chain),
    irmAddress: marketConfig.irm.toLowerCase(),
    oracleAddress: marketConfig.oracle.toLowerCase(),
    marketId: id,
    lltvPercent: marketConfig.lltv.toString(),
    loanTokenAddress: marketConfig.loanToken.toLowerCase(),
    collateralTokenAddress: marketConfig.collateralToken.toLowerCase(),
    liquidationPenalty: marketConfig.liquidationIncentiveFactor.toString(),
  })

  return {
    id,
    chain,
    entry,
  }

}
