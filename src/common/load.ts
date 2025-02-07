import {readdir, readFile} from "fs/promises"
import {z} from "zod"
import * as path from "path";
import { MAINNET_CHAINS as chains } from "@gfxlabs/oku-chains";
import { MorphoMarket, MorphoVault } from "src/common/types.js";
import { existsSync, mkdirSync } from "fs";

const SUPPORTED_CHAINS: number[] = chains.map(
  (chain: { id: number }) => chain.id,
);

function isChainSupported(chainId: number): boolean {
  return SUPPORTED_CHAINS.includes(chainId);
}

export const loadMarketsAndVaults = async (root: string) => {
  let outMarkets:Map<string,z.infer<typeof MorphoMarket>> = new Map()
  let outVaults:Map<string,z.infer<typeof MorphoVault>> = new Map()
  const folders = await readdir(root)
  for (const chainFolder of folders) {
    if (!/^\d+$/.test(chainFolder)) {
      throw new Error(`Chain folder "${chainFolder}" is not a valid integer.`);
    }
    if (!isChainSupported(Number(chainFolder))) {
      throw new Error(`Chain "${chainFolder}" is not supported.`);
    }
    const marketsFolderPath = path.join(root,chainFolder,"markets")
    if (!existsSync(marketsFolderPath)) {
      mkdirSync(marketsFolderPath)
    }
    const markets = await readdir(marketsFolderPath)
    for (const marketFolder of markets) {
      // try to open the info file
      const datafile = path.join(marketsFolderPath,marketFolder,"data.json")
      const content = await readFile(datafile, "utf8")
      if(!existsSync(datafile)){
        continue
      }
      const jsonData = JSON.parse(content)
      const validationResult = await MorphoMarket.parseAsync(jsonData)

      if (validationResult.marketId !== marketFolder) {
        throw new Error(`Market folder "${marketFolder}" does not match marketId in data.json`)
      }
      if (validationResult.chainId !== Number(chainFolder)) {
        throw new Error(`Market folder "${marketFolder}" does not match chainId in data.json`)
      }
      outMarkets.set(`${validationResult.chainId}_${validationResult.marketId}`,validationResult)
    }

    const vaultsFolderPath = path.join(root,chainFolder,"vaults")
    if (!existsSync(vaultsFolderPath)) {
      mkdirSync(vaultsFolderPath)
    }
    const vaults = await readdir(vaultsFolderPath)
    // now do the same but for vaults
    for (const vaultFolder of vaults) {
      // try to open the info file
      const datafile = path.join(vaultsFolderPath,vaultFolder,"data.json")
      if(!existsSync(datafile)){
        continue
      }
      const content = await readFile(datafile, "utf8")
      const jsonData = JSON.parse(content)
      const validationResult = await MorphoVault.parseAsync(jsonData)

      if (validationResult.vaultAddress !== vaultFolder) {
        throw new Error(`Vault folder "${vaultFolder}" does not match vaultId in data.json`)
      }
      if (validationResult.chainId !== Number(chainFolder)) {
        throw new Error(`Vault folder "${vaultFolder}" does not match chainId in data.json`)
      }
      outVaults.set(`${validationResult.chainId}_${validationResult.vaultAddress}`,validationResult)
    }
  }
  return {vaults: outVaults, markets: outMarkets}
}
