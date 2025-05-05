import {  createPublicClient, http, PublicClient } from "viem"
import dotenv from "dotenv"
import { MAINNET_CHAINS } from "@gfxlabs/oku-chains"
dotenv.config()

const chains = MAINNET_CHAINS

export const getChain = (chain: string | number) => {
  const chainId = getChainId(chain)
  const foundChain = chains.find(c => c.id === chainId)
  if(!foundChain) {
    throw new Error(`chain ${chain} not found`)
  }
  return foundChain
}

export const getChainId = (chain: string | number): number => {
  if(typeof chain === "number") {
    const foundChain = MAINNET_CHAINS.find(c => c.id === chain)
    if(!foundChain) {
      throw new Error(`chain ${chain} not found`)
    }
    return foundChain.id
  }
  var chainId: number
  if(!isNaN(parseInt(chain))) {
    chainId = parseInt(chain)
  }else {
    const foundChain = MAINNET_CHAINS.find(c => c.internalName === chain)
    if(!foundChain) {
      throw new Error(`chain ${chain} not found`)
    }
    chainId = foundChain.id
  }
  return chainId
}

export const ChainRpcs = Object.fromEntries(chains.map(chain => {
  const vennUrl = process.env.VENN_URL
  return [chain.id,
    createPublicClient({
      transport: http(`${vennUrl}/${chain.internalName}`),
    })
  ]
}))

export const ChainTransports= Object.fromEntries(chains.map(chain => {
  const vennUrl = process.env.VENN_URL
  return [chain.id,
      http(`${vennUrl}/${chain.internalName}`),
  ]
}))

export const getTransport = (chainId: number) => {
  const ans = ChainTransports[chainId]
  if (!ans) {
    throw new Error(`No transport for chain ${chainId}`)
  }
  return ans
}

export const getRpc = (chainId: number): PublicClient => {
  const ans = ChainRpcs[chainId]
  if (!ans) {
    throw new Error(`No RPC for chain ${chainId}`)
  }
  return ans
}
