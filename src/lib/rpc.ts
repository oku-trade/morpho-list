import {  createPublicClient, http, PublicClient } from "viem"
import dotenv from "dotenv"
import { MAINNET_CHAINS } from "@gfxlabs/oku-chains"
dotenv.config()

const chains = MAINNET_CHAINS

export const ChainRpcs = Object.fromEntries(chains.map(chain => {
  const vennUrl = process.env.VENN_URL
  return [chain.id,
    createPublicClient({
      transport: http(`${vennUrl}/${chain.internalName}`),
    })
  ]
}))

export const getRpc = (chainId: number): PublicClient => {
  const ans = ChainRpcs[chainId]
  if (!ans) {
    throw new Error(`No RPC for chain ${chainId}`)
  }
  return ans
}
