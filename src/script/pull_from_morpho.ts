import {  Address, createPublicClient, getAddress, http, parseAbiItem, PublicClient } from "viem"
import {fetchVault, fetchVaultConfig, fetchMarket, fetchMarketParams} from "@morpho-org/blue-sdk-viem"
import { loadMarketsAndVaults } from "src/common/load.js"
import { gql, GraphQLClient } from "graphql-request"
import { MorphoMarket, MorphoVault } from "src/common/types.js"
import { typecheck } from "src/common/utils.js"
import { existsSync, mkdirSync, statSync, writeFileSync } from "fs"
import path from "path"
import { MarketId } from "@morpho-org/blue-sdk"
import dotenv from "dotenv"
dotenv.config()

const pcs: Record<string, PublicClient> = {
  1: createPublicClient({
    transport: http(`${process.env.VENN_URL}/ethereum`),
  }),
  8453: createPublicClient({
    transport: http(`${process.env.VENN_URL}/base`),
  })
}

const endpoint = 'https://blue-api.morpho.org/graphql'
const gc = new GraphQLClient(endpoint)

const GetMarketIdsFromMorpho = async () => {
  const doc = gql`
query Items($skip: Int) {
  markets(skip: $skip) {
    items {
      uniqueKey
      morphoBlue {
        chain {
          id
        }
      }
    }
  }
}`

  let skip = 0
  const allItems: {chain: string, id: string}[] = []
  while(true) {
    const query:any = await gc.request(doc, {skip: skip})

    const items = query.markets.items.map((x:any)=>{
      return {
        chain: x.morphoBlue.chain.id,
        id: (x.uniqueKey as string).toLowerCase(),
      }
    })
    skip += items.length
    if(items.length == 0){
      break
    }
    allItems.push(...items)
  }
  return allItems
}

const getVaultAddressesFromMorpho = async () => {
  const doc = gql`
query Items($skip: Int) {
  vaults(skip: $skip) {
    items {
      address
      chain {
        id
      }
    }
  }
}`
  let skip = 0
  const allItems: {chain: string, address: Address}[] = []
  while(true) {
    const query:any = await gc.request(doc, {skip: skip})

    const items = query.vaults.items.map((x:any)=>{
      return {
        chain: x.chain.id,
        address: getAddress((x.address as string)).toLowerCase() as Address,
      }
    })
    skip += items.length
    if(items.length == 0){
      break
    }
    allItems.push(...items)
  }
  return allItems
}

const main = async () => {
  const rootpath = path.join(`./chains`)
  const ans = await loadMarketsAndVaults(rootpath)
  console.log(ans)

  const morphoApiMarkets  = await GetMarketIdsFromMorpho()
  const morphoApiVaults = await getVaultAddressesFromMorpho()

  console.log("vaults", morphoApiVaults.length, "markets", morphoApiMarkets.length)
  for (const item of morphoApiVaults) {
    if(ans.vaults.has(`${item.chain}_${item.address}`)){
      console.log("skipping", item.chain, item.address)
      continue
    }
    // now try to get the vault
    const pc = pcs[item.chain] as PublicClient
    if(!pc){
      continue
    }
    const vaultConfig = await fetchVaultConfig(item.address, pc)
    const vaultLive = await fetchVault(item.address, pc)
    // try to create an entry now
    let entry = await typecheck(MorphoVault, {
      enabled: true,
      vaultAddress: item.address,
      chainId: Number(item.chain),
      tokenAddress: vaultConfig.address,
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
