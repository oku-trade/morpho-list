import { readdir, readFile } from "fs/promises"
import { z } from "zod"
import * as path from "path";
import { MAINNET_CHAINS as chains } from "@gfxlabs/oku-chains";
import { Blacklist, MorphoMarket, MorphoRewardProgram, MorphoVault } from "src/lib/types.js";
import { existsSync, mkdirSync, writeFileSync } from "fs";

const SUPPORTED_CHAINS: number[] = chains.map(
  (chain: { id: number }) => chain.id,
);

function isChainSupported(chainId: number): boolean {
  return SUPPORTED_CHAINS.includes(chainId);
}

export const DataType = ["markets", "vaults", "rewards", "blacklist"] as const
export type DataType = typeof DataType[number]

export type DataTypeTypeMap = {
  markets: z.infer<typeof MorphoMarket>
  vaults: z.infer<typeof MorphoVault>
  rewards: z.infer<typeof MorphoRewardProgram>
  blacklist: z.infer<typeof Blacklist>
}

export const DataTypeZodMap = {
  markets: MorphoMarket,
  vaults: MorphoVault,
  rewards: MorphoRewardProgram,
  blacklist: Blacklist,
} as const


export const storeData = <T extends DataType>(root: string, chainFolder: string, datatype: T, keyFolder: string, data: DataTypeTypeMap[T]) => {
  const validator = DataTypeZodMap[datatype]
  if (!validator) {
    throw new Error(`Datatype "${datatype}" is not supported`)
  }
  // make sure our data is good
  validator.parse(data)
  const targetDataDir = path.join(root, chainFolder, datatype, keyFolder)
  if (!existsSync(targetDataDir)) {
    mkdirSync(targetDataDir, { recursive: true })
  }
  const targetDataFile = path.join(targetDataDir, "data.json")
  writeFileSync(targetDataFile, JSON.stringify(data, null, 2))

  return targetDataFile
}

export const loadData = async <T extends DataType>(root: string, chainFolder: string, datatype: T, keyFolder: string): Promise<DataTypeTypeMap[T]> => {
  const validator = DataTypeZodMap[datatype]
  if (!validator) {
    throw new Error(`Datatype "${datatype}" is not supported`)
  }
  const datafile = path.join(root, chainFolder, datatype, keyFolder, "data.json")
  const content = await readFile(datafile, "utf8")
  if (!existsSync(datafile)) {
    throw new Error(`${datatype} "${keyFolder}" does not exist`)
  }
  const jsonData = JSON.parse(content)
  const validationResult = await validator.parseAsync(jsonData)
  return validationResult as DataTypeTypeMap[T]
}

export const loadMarket = async (root: string, chainFolder: string, marketFolder: string) => {
  return loadData(root, chainFolder, "markets", marketFolder)
}

export const loadVault = async (root: string, chainFolder: string, vaultFolder: string) => {
  return loadData(root, chainFolder, "vaults", vaultFolder)
}

export const loadAllData = async <T extends DataType>(root: string, datatype: T): Promise<Array<DataTypeTypeMap[T]>> => {
  let out = new Array<DataTypeTypeMap[T]>()
  const folders = await readdir(root)
  for (const chainFolder of folders) {
    if (!/^\d+$/.test(chainFolder)) {
      throw new Error(`Chain folder "${chainFolder}" is not a valid integer.`);
    }
    if (!isChainSupported(Number(chainFolder))) {
      throw new Error(`Chain "${chainFolder}" is not supported.`);
    }
    const marketsFolderPath = path.join(root, chainFolder, datatype)
    if (!existsSync(marketsFolderPath)) {
      continue
    }
    const keyFolders = await readdir(marketsFolderPath)
    for (const keyFolder of keyFolders) {
      const validationResult = await loadData(root, chainFolder, datatype, keyFolder)
      out.push(validationResult)
    }
  }
  return out
}

export const loadMarketsAndVaults = async (root: string) => {
  let outMarkets: Map<string, z.infer<typeof MorphoMarket>> = new Map()
  let outVaults: Map<string, z.infer<typeof MorphoVault>> = new Map()
  const folders = await readdir(root)
  for (const chainFolder of folders) {
    if (!/^\d+$/.test(chainFolder)) {
      throw new Error(`Chain folder "${chainFolder}" is not a valid integer.`);
    }
    if (!isChainSupported(Number(chainFolder))) {
      throw new Error(`Chain "${chainFolder}" is not supported.`);
    }
    const marketsFolderPath = path.join(root, chainFolder, "markets")
    if (!existsSync(marketsFolderPath)) {
      mkdirSync(marketsFolderPath)
    }
    const markets = await readdir(marketsFolderPath)
    for (const marketFolder of markets) {
      const validationResult = await loadMarket(root, chainFolder, marketFolder)
      outMarkets.set(`${validationResult.chainId}_${validationResult.marketId}`, validationResult)
    }

    const vaultsFolderPath = path.join(root, chainFolder, "vaults")
    if (!existsSync(vaultsFolderPath)) {
      mkdirSync(vaultsFolderPath)
    }
    const vaults = await readdir(vaultsFolderPath)
    // now do the same but for vaults
    for (const vaultFolder of vaults) {
      // try to open the info file
      const validationResult = await loadVault(root, chainFolder, vaultFolder)
      outVaults.set(`${validationResult.chainId}_${validationResult.vaultAddress}`, validationResult)
    }
  }
  return { vaults: outVaults, markets: outMarkets }
}
