import { z } from "zod";

export const zHash = z.string().regex(/^0x[a-f0-9]{64}$/)
export const zAddress = z.string().regex(/^0x[a-f0-9]{40}$/)
export const zStringInt = z.string().regex(/^\d*$/)

export const MorphoCurator = z.object({
  id: z.string(),
  name: z.string().optional(),
  addresses: z.record(zStringInt, zAddress).optional(),
  description: z.string().optional(),
  homepage: z.string().optional(),
  logo: z.string().optional(),
})


export const MorphoVault = z.object({
  chainId: z.number(),
  name: z.string().optional(),
  description: z.string().optional(),
  tokenAddress: z.string(),
  performanceFeePercentage: zStringInt,
  vaultAddress: z.string(),
  guardianAddress: z.string(),
  curatorAddress: z.string(),
  enabled: z.boolean(),
  blacklisted: z.boolean().optional(),
})

export const MorphoMarket = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  chainId: z.number().int(),
  marketId: zHash,
  collateralTokenAddress: zAddress,
  loanTokenAddress: zAddress,
  oracleAddress: zAddress,
  irmAddress: zAddress,

  lltvPercent: zStringInt,
  liquidationPenalty: zStringInt,

  enabled: z.boolean(),
  blacklisted: z.boolean().optional(),
})

export const MasterListEntry = z.object({
  vaults: z.array(MorphoVault),
  markets: z.array(MorphoMarket),
})

export const MasterList = z.object({
  chains: z.record(zStringInt,MasterListEntry),
})
