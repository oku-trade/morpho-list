import "../inject.js"
import { fetchAccrualVault, fetchMarketParams, fetchVault, fetchVaultConfig } from "@morpho-org/blue-sdk-viem";
import { getRpc } from "./rpc.js"
import { typecheck } from "src/lib/utils.js";
import { MorphoMarket, MorphoVault } from "src/lib/types.js";
import { Address, zeroAddress } from "viem";
import { MarketId } from "@morpho-org/blue-sdk";


export const getVaultByAddress =  async (chain: number, address: Address) => {
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
