import { type Address } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

function envAddress(name: string): Address {
  const raw = process.env[name];
  if (!raw || !raw.startsWith("0x") || raw.length !== 42) {
    return ZERO_ADDRESS;
  }
  return raw as Address;
}

export const publicConfig = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337"),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  adminAddress: envAddress("NEXT_PUBLIC_ADMIN_ADDRESS"),
  marketAddress: envAddress("NEXT_PUBLIC_MARKET_ADDRESS"),
  pegOracleAddress: envAddress("NEXT_PUBLIC_PEG_ORACLE_ADDRESS"),
  inventoryVaultAddress: envAddress("NEXT_PUBLIC_INVENTORY_VAULT_ADDRESS"),
  usdcAddress: envAddress("NEXT_PUBLIC_USDC_ADDRESS"),
};

export const zeroAddress = ZERO_ADDRESS;
