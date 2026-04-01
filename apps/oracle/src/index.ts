import { createClient } from "@supabase/supabase-js";
import {
  concat,
  createPublicClient,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type PriceUpdate = {
  skuId: Hex;
  pegPrice: bigint;
  method: bigint;
  n: bigint;
  windowSeconds: bigint;
  salesHash: Hex;
  observedAt: bigint;
  expiry: bigint;
  nonce: bigint;
};

export type SignedPriceUpdateResult = {
  update: PriceUpdate;
  signature: Hex;
  pricesUsed: string[];
  soldCompIds: string[];
};

export type ComputeAndSignInput = {
  skuId: Hex;
  n: number;
  windowSeconds: number;
  chainId: number;
  verifyingContract: Address;
  rpcUrl: string;
  expirySeconds?: number;
  method?: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  oraclePrivateKey: Hex;
  nowSeconds?: number;
};

const pegOracleReadAbi = [
  {
    type: "function",
    name: "getPeg",
    stateMutability: "view",
    inputs: [{ name: "skuId", type: "bytes32" }],
    outputs: [
      { name: "pegPrice", type: "uint256" },
      { name: "observedAt", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  },
] as const;

const priceUpdateTypes = {
  PriceUpdate: [
    { name: "skuId", type: "bytes32" },
    { name: "pegPrice", type: "uint256" },
    { name: "method", type: "uint256" },
    { name: "n", type: "uint256" },
    { name: "windowSeconds", type: "uint256" },
    { name: "salesHash", type: "bytes32" },
    { name: "observedAt", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

type SoldCompRow = {
  id: string;
  price_cents: string | number;
  sold_at: string;
};

export async function computeAndSignPegUpdate(input: ComputeAndSignInput): Promise<SignedPriceUpdateResult> {
  assertBytes32(input.skuId, "skuId");
  if (input.n <= 0) {
    throw new Error("n must be > 0");
  }
  if (input.windowSeconds <= 0) {
    throw new Error("windowSeconds must be > 0");
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const cutoffIso = new Date((nowSeconds - input.windowSeconds) * 1000).toISOString();

  const supabase = createClient(input.supabaseUrl, input.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("sold_comps")
    .select("id, price_cents, sold_at")
    .eq("sku_id", input.skuId)
    .gte("sold_at", cutoffIso)
    .order("sold_at", { ascending: false })
    .limit(input.n);

  if (error) {
    throw new Error(`Failed to fetch sold comps: ${error.message}`);
  }

  const rows = (data ?? []) as SoldCompRow[];
  if (!rows.length) {
    throw new Error("No sold comps found for sku in requested window");
  }

  const prices = rows.map((row) => BigInt(String(row.price_cents)));
  const sortedPrices = [...prices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const median = medianOfSorted(sortedPrices);
  const salesHash = hashSortedPrices(sortedPrices);

  const publicClient = createPublicClient({ transport: http(input.rpcUrl) });
  const pegTuple = (await publicClient.readContract({
    address: input.verifyingContract,
    abi: pegOracleReadAbi,
    functionName: "getPeg",
    args: [input.skuId],
  })) as readonly [bigint, bigint, bigint];

  const currentNonce = pegTuple[2];

  const update: PriceUpdate = {
    skuId: input.skuId,
    pegPrice: median,
    method: BigInt(input.method ?? 1),
    n: BigInt(rows.length),
    windowSeconds: BigInt(input.windowSeconds),
    salesHash,
    observedAt: BigInt(nowSeconds),
    expiry: BigInt(nowSeconds + (input.expirySeconds ?? 300)),
    nonce: currentNonce + 1n,
  };

  const account = privateKeyToAccount(input.oraclePrivateKey);
  const signature = await account.signTypedData({
    domain: {
      name: "CardzCheckPegOracle",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.verifyingContract,
    },
    types: priceUpdateTypes,
    primaryType: "PriceUpdate",
    message: update,
  });

  return {
    update,
    signature,
    pricesUsed: sortedPrices.map((v) => v.toString()),
    soldCompIds: rows.map((row) => row.id),
  };
}

export function toJsonSafeSignedUpdate(result: SignedPriceUpdateResult): Record<string, unknown> {
  return {
    update: {
      skuId: result.update.skuId,
      pegPrice: result.update.pegPrice.toString(),
      method: result.update.method.toString(),
      n: result.update.n.toString(),
      windowSeconds: result.update.windowSeconds.toString(),
      salesHash: result.update.salesHash,
      observedAt: result.update.observedAt.toString(),
      expiry: result.update.expiry.toString(),
      nonce: result.update.nonce.toString(),
    },
    signature: result.signature,
    pricesUsed: result.pricesUsed,
    soldCompIds: result.soldCompIds,
  };
}

function medianOfSorted(values: bigint[]): bigint {
  if (!values.length) {
    throw new Error("Cannot compute median of empty array");
  }
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[mid];
  }
  return (values[mid - 1] + values[mid]) / 2n;
}

function hashSortedPrices(sortedPrices: bigint[]): Hex {
  const padded = sortedPrices.map((v) => toHex(v, { size: 32 }));
  const packed = padded.length === 1 ? padded[0] : concat(padded);
  return keccak256(packed);
}

function assertBytes32(value: Hex, field: string): void {
  if (value.length !== 66) {
    throw new Error(`${field} must be a bytes32 hex string`);
  }
}
