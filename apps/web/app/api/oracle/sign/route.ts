import { NextResponse } from "next/server";
import { computeAndSignPegUpdate, toJsonSafeSignedUpdate } from "@cardzcheck/oracle";
import { type Address, type Hex } from "viem";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      skuId: Hex;
      n: number;
      windowSeconds: number;
      chainId: number;
      verifyingContract: Address;
      expirySeconds?: number;
    };

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const oraclePrivateKey = process.env.ORACLE_PRIVATE_KEY as Hex | undefined;
    const rpcUrl = process.env.RPC_URL;

    if (!supabaseUrl || !supabaseServiceRoleKey || !oraclePrivateKey || !rpcUrl) {
      return NextResponse.json(
        { error: "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORACLE_PRIVATE_KEY, or RPC_URL" },
        { status: 500 }
      );
    }

    const result = await computeAndSignPegUpdate({
      skuId: body.skuId,
      n: body.n,
      windowSeconds: body.windowSeconds,
      chainId: body.chainId,
      verifyingContract: body.verifyingContract,
      expirySeconds: body.expirySeconds,
      rpcUrl,
      supabaseUrl,
      supabaseServiceRoleKey,
      oraclePrivateKey,
    });

    return NextResponse.json(toJsonSafeSignedUpdate(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Oracle sign failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
