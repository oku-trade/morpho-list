import { MAINNET_CHAINS } from "@gfxlabs/oku-chains";
import {addresses, ChainId, ChainUtils, NATIVE_ADDRESS, unwrappedTokensMapping} from "@morpho-org/blue-sdk";

for(const chain of MAINNET_CHAINS) {
  if(Object.keys(ChainUtils.CHAIN_METADATA).includes(`${chain.id}`)) {
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
  ChainUtils.CHAIN_METADATA[chain.id as ChainId] = {
    name: chain.name,
    id: chain.id as ChainId,
    nativeCurrency: chain.nativeCurrency,
    explorerUrl: chain.blockExplorers.default.url,
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
