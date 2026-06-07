import { type PublicClient, hexToBigInt, type Hex } from "viem"

// Celo fee-currency-aware gas pricing. When paying gas in a non-CELO currency
// (cUSD, USDC adapter, …) you MUST price gas with the Celo-extended eth_gasPrice
// RPC passing the feeCurrency address, and estimate gas WITH feeCurrency set
// (fee-currency txs carry extra intrinsic gas for the debit/credit calls).
// Using the standard getGasPrice() would return CELO-denominated pricing and
// the tx would be rejected (maxFeePerGas too low in that currency).

/** Gas price denominated in `feeCurrency` (or native CELO when omitted). */
export async function gasPriceFor(client: PublicClient, feeCurrency?: Hex): Promise<bigint> {
  if (!feeCurrency) return client.getGasPrice()
  const hex = (await client.request({
    method: "eth_gasPrice" as never,
    params: [feeCurrency] as never,
  })) as Hex
  return hexToBigInt(hex)
}

/** Build the extra fields a Celo fee-currency tx needs (feeCurrency + priced gas). */
export async function feeFields(
  client: PublicClient,
  feeCurrency?: Hex,
): Promise<{ feeCurrency?: Hex; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const price = await gasPriceFor(client, feeCurrency)
  // A small headroom over the quoted price guards against base-fee drift.
  const maxFeePerGas = (price * 12n) / 10n
  return {
    ...(feeCurrency ? { feeCurrency } : {}),
    maxFeePerGas,
    maxPriorityFeePerGas: price,
  }
}
