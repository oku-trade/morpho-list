import { MAINNET_CHAINS } from "@gfxlabs/oku-chains";
import {addresses, ChainId, ChainUtils, NATIVE_ADDRESS, unwrappedTokensMapping} from "@morpho-org/blue-sdk";

for(const chain of MAINNET_CHAINS) {
  if(ChainUtils.BLUE_AVAILABLE_CHAINS.includes(chain.id as ChainId)) {
    // skip since its already in the code
    continue;
  }

  if(
    !(
      "morpho" in chain.morpho &&
        "bundler3" in chain.morpho &&
        "publicAllocator" in chain.morpho
    ) ||
      !(
        "wrappedNativeAddress" in chain.uniswap &&
        "permit2" in chain.uniswap
      )
  ) {
    continue
  }
  ChainUtils.BLUE_AVAILABLE_CHAINS.push(chain.id as ChainId);
  ChainUtils.CHAIN_METADATA[chain.id as ChainId] = {
    name: chain.name,
    id: chain.id as ChainId,
    nativeCurrency: chain.nativeCurrency,
    defaultRpcUrl: chain.rpcUrls.default.http[0],
    explorerUrl: chain.blockExplorers.default.url,
    isTestnet: false,
    shortName: chain.name,
    logoSrc: chain.logoUrl,
    identifier: chain.internalName,
  }

  const modifiable = addresses as any
  modifiable[chain.id as ChainId] = {
    morpho: chain.morpho.morpho,
    bundler: chain.morpho.bundler3,
    permit2: chain.uniswap.permit2,
    publicAllocator: chain.morpho.publicAllocator
  }

  unwrappedTokensMapping[chain.id as ChainId] = {
    [chain.uniswap.wrappedNativeAddress]: NATIVE_ADDRESS,
  }
}
