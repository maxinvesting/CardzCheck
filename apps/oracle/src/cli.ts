import "dotenv/config";
import { computeAndSignPegUpdate, toJsonSafeSignedUpdate } from "./index.js";
import { type Address, type Hex } from "viem";

function getArg(name: string, required = true): string | undefined {
  const idx = process.argv.findIndex((arg) => arg === `--${name}`);
  if (idx === -1) {
    if (required) {
      throw new Error(`Missing required argument --${name}`);
    }
    return undefined;
  }
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const skuId = getArg("skuId") as Hex;
  const n = Number(getArg("n") ?? "7");
  const windowSeconds = Number(getArg("windowSeconds") ?? `${30 * 24 * 60 * 60}`);
  const chainId = Number(getArg("chainId"));
  const verifyingContract = getArg("verifyingContract") as Address;
  const expirySeconds = Number(getArg("expirySeconds", false) ?? "300");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY as Hex | undefined;
  const rpcUrl = process.env.RPC_URL;

  if (!supabaseUrl || !supabaseServiceRoleKey || !oraclePrivateKey || !rpcUrl) {
    throw new Error(
      "Missing required env vars. Expected SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORACLE_PRIVATE_KEY, RPC_URL"
    );
  }

  const result = await computeAndSignPegUpdate({
    skuId,
    n,
    windowSeconds,
    chainId,
    verifyingContract,
    rpcUrl,
    expirySeconds,
    supabaseUrl,
    supabaseServiceRoleKey,
    oraclePrivateKey,
  });

  process.stdout.write(`${JSON.stringify(toJsonSafeSignedUpdate(result), null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`oracle sign failed: ${message}\n`);
  process.exit(1);
});
