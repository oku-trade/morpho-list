import {  Address, createPublicClient, getAddress, Hash, http, parseAbiItem, PublicClient } from "viem"
import {fetchVault, fetchVaultConfig, fetchMarket, fetchMarketParams, fetchAccrualVault} from "@morpho-org/blue-sdk-viem"
import { loadMarketsAndVaults } from "src/lib/load.js"
import { MorphoMarket, MorphoVault } from "src/lib/types.js"
import { typecheck } from "src/lib/utils.js"
import { existsSync, mkdirSync, statSync, writeFileSync } from "fs"
import path from "path"
import { MarketId } from "@morpho-org/blue-sdk"
import dotenv from "dotenv"
import { vault_addresses } from "src/data/vault_addresses.js"
dotenv.config()

const pcs: Record<string, PublicClient> = {
  1: createPublicClient({
    transport: http(`${process.env.VENN_URL}/ethereum`),
  }),
  8453: createPublicClient({
    transport: http(`${process.env.VENN_URL}/base`),
  })
}

const main = async () => {
  const rootpath = path.join(`./chains`)
  const ans = await loadMarketsAndVaults(rootpath)
  console.log(ans)

  const allVaults = Object.entries(vault_addresses).map(([chain, vaults]) => {
    return vaults.map((vault) => {
      return {
        chain: chain,
        address: vault as Address,
      }
    })
  }).flat()


  const morphoMarketsSet = new Map<string, Set<Hash>>()
  console.log("vaults", allVaults.length)
  for (const item of allVaults) {
    // now try to get the vault
    const pc = pcs[item.chain] as PublicClient
    if(!pc){
      continue
    }
    const vaultAccural = await fetchAccrualVault(item.address, pc)
    const vaultMarkets = vaultAccural.allocations.keys()
    if(!morphoMarketsSet.has(item.chain)){
      morphoMarketsSet.set(item.chain, new Set())
    }
    vaultMarkets.forEach((market) => {
      morphoMarketsSet.get(item.chain)?.add(market as Hash)
    })

    if(ans.vaults.has(`${item.chain}_${item.address}`)){
      console.log("skipping", item.chain, item.address)
      continue
    }

    const vaultConfig = await fetchVaultConfig(item.address, pc)
    const vaultLive = await fetchVault(item.address, pc)

    console.log("got vault config", vaultConfig)



    // try to create an entry now
    let entry = await typecheck(MorphoVault, {
      enabled: true,
      vaultAddress: item.address,
      chainId: Number(item.chain),
      tokenAddress: vaultConfig.asset,
      curatorAddress: vaultLive.curator,
      guardianAddress: vaultLive.guardian,
      performanceFeePercentage: vaultLive.fee.toString(),
      name: vaultConfig.name,
    })
    // now try to write this
    console.log("writing new vault", item.chain, item.address)
    const targetVaultDir = path.join(rootpath, `${item.chain}`, "vaults", item.address)
    if(!existsSync(targetVaultDir)){
      mkdirSync(targetVaultDir, {recursive: true})
    }
    const targetVaultFile = path.join(targetVaultDir, "data.json")
    writeFileSync(targetVaultFile, JSON.stringify(entry, null, 2))
  }

  const morphoApiMarkets = Array.from(morphoMarketsSet.entries().flatMap(([chain, markets]) => {
    return markets.values().map((market) => {
      return {
        chain: chain,
        id: market,
      }
    })
  }))
  console.log("markets", morphoApiMarkets.length)

  // now do the same for markets
  for (const item of morphoApiMarkets) {
    if(ans.markets.has(`${item.chain}_${item.id}`)){
      console.log("skipping", item.chain, item.id)
      continue
    }
    // now try to get the market
    const pc = pcs[item.chain] as PublicClient
    if(!pc){
      continue
    }
    const marketConfig = await fetchMarketParams(item.id as MarketId, pc)
    console.log("got market config", marketConfig)
    // try to create an entry now
    let entry = await typecheck(MorphoMarket, {
      enabled: true,
      chainId: Number(item.chain),
      irmAddress: marketConfig.irm.toLowerCase(),
      oracleAddress: marketConfig.oracle.toLowerCase(),
      marketId: item.id,
      lltvPercent: marketConfig.lltv.toString(),
      loanTokenAddress: marketConfig.loanToken.toLowerCase(),
      collateralTokenAddress: marketConfig.collateralToken.toLowerCase(),
      liquidationPenalty: marketConfig.liquidationIncentiveFactor.toString(),
    })
    // now try to write this
    console.log("writing new market", item.chain, item.id)
    const targetMarketDir = path.join(rootpath, `${item.chain}`, "markets", item.id)
    if(!existsSync(targetMarketDir)){
      mkdirSync(targetMarketDir)
    }
    const targetMarketFile = path.join(targetMarketDir, "data.json")
    writeFileSync(targetMarketFile, JSON.stringify(entry, null, 2))
  }
}

main().catch(console.error)
