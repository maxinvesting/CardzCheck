"use client";

import { FormEvent, useMemo, useState } from "react";
import { type Hex } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { getPublicClient } from "@/lib/chain";
import { inventoryVaultAbi, pegOracleAbi } from "@/lib/contracts";
import { publicConfig, zeroAddress } from "@/lib/env";
import { parseUsdc } from "@/lib/format";
import { computeSkuId } from "@/lib/sku";

type SignedUpdatePayload = {
  update: {
    skuId: Hex;
    pegPrice: string;
    method: string;
    n: string;
    windowSeconds: string;
    salesHash: Hex;
    observedAt: string;
    expiry: string;
    nonce: string;
  };
  signature: Hex;
  pricesUsed: string[];
  soldCompIds: string[];
};

export default function AdminPage() {
  const publicClient = useMemo(() => getPublicClient(), []);
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [createSkuForm, setCreateSkuForm] = useState({
    skuId: "",
    name: "",
    imageUrl: "",
    detailsJson: "{}",
  });

  const [fingerprintForm, setFingerprintForm] = useState({
    year: "",
    set: "",
    player: "",
    cardNo: "",
    parallel: "",
    grade: "",
  });

  const [mintForm, setMintForm] = useState({ skuId: "", qty: "1" });
  const [compForm, setCompForm] = useState({
    skuId: "",
    price: "",
    soldAt: new Date().toISOString().slice(0, 16),
    source: "ebay_sold",
    externalId: "",
    rawJson: "{}",
  });
  const [oracleForm, setOracleForm] = useState({
    skuId: "",
    n: "7",
    windowSeconds: (30 * 24 * 60 * 60).toString(),
    expirySeconds: "300",
  });
  const [signedUpdate, setSignedUpdate] = useState<SignedUpdatePayload | null>(null);

  const isAdmin =
    !!address &&
    publicConfig.adminAddress !== zeroAddress &&
    address.toLowerCase() === publicConfig.adminAddress.toLowerCase();

  function resetMessages() {
    setError("");
    setStatus("");
  }

  async function createSku(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    setBusy(true);

    try {
      const details = createSkuForm.detailsJson ? JSON.parse(createSkuForm.detailsJson) : {};
      const response = await fetch("/api/admin/create-sku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: createSkuForm.skuId,
          name: createSkuForm.name,
          imageUrl: createSkuForm.imageUrl,
          details,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to create SKU");
      }

      setStatus("SKU created in Supabase");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Create SKU failed");
    } finally {
      setBusy(false);
    }
  }

  async function mintInventory(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    setBusy(true);

    try {
      const qty = BigInt(mintForm.qty);
      const tokenId = BigInt(mintForm.skuId as Hex);
      const txHash = await writeContractAsync({
        address: publicConfig.inventoryVaultAddress,
        abi: inventoryVaultAbi,
        functionName: "mint",
        args: [publicConfig.marketAddress, tokenId, qty],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setStatus(`Inventory minted to market: ${txHash}`);
    } catch (mintError) {
      setError(mintError instanceof Error ? mintError.message : "Mint failed");
    } finally {
      setBusy(false);
    }
  }

  async function addComp(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    setBusy(true);

    try {
      const raw = compForm.rawJson ? JSON.parse(compForm.rawJson) : {};
      const priceCents = parseUsdc(compForm.price).toString();

      const response = await fetch("/api/admin/add-comp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: compForm.skuId,
          priceCents,
          soldAt: new Date(compForm.soldAt).toISOString(),
          source: compForm.source,
          externalId: compForm.externalId,
          raw,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Add comp failed");
      }

      setStatus("Sold comp inserted");
    } catch (compError) {
      setError(compError instanceof Error ? compError.message : "Add comp failed");
    } finally {
      setBusy(false);
    }
  }

  async function computeAndSign(event: FormEvent) {
    event.preventDefault();
    resetMessages();
    setBusy(true);

    try {
      const response = await fetch("/api/oracle/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: oracleForm.skuId,
          n: Number(oracleForm.n),
          windowSeconds: Number(oracleForm.windowSeconds),
          chainId: publicConfig.chainId,
          verifyingContract: publicConfig.pegOracleAddress,
          expirySeconds: Number(oracleForm.expirySeconds),
        }),
      });

      const payload = (await response.json()) as SignedUpdatePayload | { error?: string };
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? "Compute/sign failed");
      }

      setSignedUpdate(payload as SignedUpdatePayload);
      setStatus("Oracle update computed and signed");
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : "Compute/sign failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitPegUpdate() {
    if (!signedUpdate) {
      return;
    }

    resetMessages();
    setBusy(true);

    try {
      const update = {
        skuId: signedUpdate.update.skuId,
        pegPrice: BigInt(signedUpdate.update.pegPrice),
        method: BigInt(signedUpdate.update.method),
        n: BigInt(signedUpdate.update.n),
        windowSeconds: BigInt(signedUpdate.update.windowSeconds),
        salesHash: signedUpdate.update.salesHash,
        observedAt: BigInt(signedUpdate.update.observedAt),
        expiry: BigInt(signedUpdate.update.expiry),
        nonce: BigInt(signedUpdate.update.nonce),
      };

      const txHash = await writeContractAsync({
        address: publicConfig.pegOracleAddress,
        abi: pegOracleAbi,
        functionName: "submitPriceUpdate",
        args: [update, signedUpdate.signature],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      await fetch("/api/admin/log-peg-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId: update.skuId,
          pegPrice: update.pegPrice.toString(),
          method: Number(update.method),
          n: Number(update.n),
          windowSeconds: Number(update.windowSeconds),
          salesHash: update.salesHash,
          observedAt: new Date(Number(update.observedAt) * 1000).toISOString(),
          nonce: update.nonce.toString(),
          txHash,
        }),
      });

      setStatus(`Peg update submitted: ${txHash}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Submit peg update failed");
    } finally {
      setBusy(false);
    }
  }

  if (publicConfig.adminAddress === zeroAddress) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Set `NEXT_PUBLIC_ADMIN_ADDRESS` to enable admin gating.
      </p>
    );
  }

  if (!isAdmin) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">
        Connected wallet is not admin.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>

      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">{error}</div> : null}
      {status ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">{status}</div> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">SKU Fingerprint Helper</h2>
        <div className="grid gap-2 md:grid-cols-3">
          {([
            ["year", "Year"],
            ["set", "Set"],
            ["player", "Player"],
            ["cardNo", "Card #"],
            ["parallel", "Parallel"],
            ["grade", "Grade"],
          ] as const).map(([key, label]) => (
            <input
              key={key}
              placeholder={label}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={fingerprintForm[key]}
              onChange={(event) =>
                setFingerprintForm((prev) => ({
                  ...prev,
                  [key]: event.target.value,
                }))
              }
            />
          ))}
        </div>
        <button
          type="button"
          className="mt-3 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white"
          onClick={() => {
            const skuId = computeSkuId(fingerprintForm);
            setCreateSkuForm((prev) => ({ ...prev, skuId }));
            setMintForm((prev) => ({ ...prev, skuId }));
            setCompForm((prev) => ({ ...prev, skuId }));
            setOracleForm((prev) => ({ ...prev, skuId }));
          }}
        >
          Compute skuId
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">Create SKU (Supabase)</h2>
        <form className="space-y-2" onSubmit={(event) => void createSku(event)}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="skuId (0x... bytes32)"
            value={createSkuForm.skuId}
            onChange={(event) => setCreateSkuForm((prev) => ({ ...prev, skuId: event.target.value }))}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Name"
            value={createSkuForm.name}
            onChange={(event) => setCreateSkuForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Image URL"
            value={createSkuForm.imageUrl}
            onChange={(event) => setCreateSkuForm((prev) => ({ ...prev, imageUrl: event.target.value }))}
          />
          <textarea
            className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            placeholder='Details JSON e.g. {"year":"1986"}'
            value={createSkuForm.detailsJson}
            onChange={(event) => setCreateSkuForm((prev) => ({ ...prev, detailsJson: event.target.value }))}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Create SKU
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">Mint Inventory to Market</h2>
        <form className="space-y-2" onSubmit={(event) => void mintInventory(event)}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="skuId (0x... bytes32)"
            value={mintForm.skuId}
            onChange={(event) => setMintForm((prev) => ({ ...prev, skuId: event.target.value }))}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Quantity"
            type="number"
            min={1}
            step={1}
            value={mintForm.qty}
            onChange={(event) => setMintForm((prev) => ({ ...prev, qty: event.target.value }))}
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Mint Inventory
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">Add Sold Comp (Supabase)</h2>
        <form className="space-y-2" onSubmit={(event) => void addComp(event)}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="skuId"
            value={compForm.skuId}
            onChange={(event) => setCompForm((prev) => ({ ...prev, skuId: event.target.value }))}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Price in USDC (e.g. 120.50)"
            value={compForm.price}
            onChange={(event) => setCompForm((prev) => ({ ...prev, price: event.target.value }))}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="datetime-local"
            value={compForm.soldAt}
            onChange={(event) => setCompForm((prev) => ({ ...prev, soldAt: event.target.value }))}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="source"
            value={compForm.source}
            onChange={(event) => setCompForm((prev) => ({ ...prev, source: event.target.value }))}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="external id"
            value={compForm.externalId}
            onChange={(event) => setCompForm((prev) => ({ ...prev, externalId: event.target.value }))}
          />
          <textarea
            className="h-28 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
            placeholder="raw JSON"
            value={compForm.rawJson}
            onChange={(event) => setCompForm((prev) => ({ ...prev, rawJson: event.target.value }))}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Add Sold Comp
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">Compute + Sign Peg</h2>
        <form className="space-y-2" onSubmit={(event) => void computeAndSign(event)}>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="skuId"
            value={oracleForm.skuId}
            onChange={(event) => setOracleForm((prev) => ({ ...prev, skuId: event.target.value }))}
            required
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="number"
            min={1}
            value={oracleForm.n}
            onChange={(event) => setOracleForm((prev) => ({ ...prev, n: event.target.value }))}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="number"
            min={1}
            value={oracleForm.windowSeconds}
            onChange={(event) => setOracleForm((prev) => ({ ...prev, windowSeconds: event.target.value }))}
          />
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="number"
            min={10}
            value={oracleForm.expirySeconds}
            onChange={(event) => setOracleForm((prev) => ({ ...prev, expirySeconds: event.target.value }))}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Compute + Sign
          </button>
        </form>

        {signedUpdate ? (
          <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm">
              Peg price: <span className="font-mono">{signedUpdate.update.pegPrice}</span>
            </p>
            <p className="text-sm">
              Nonce: <span className="font-mono">{signedUpdate.update.nonce}</span>
            </p>
            <p className="text-sm">
              salesHash: <span className="font-mono">{signedUpdate.update.salesHash}</span>
            </p>
            <button
              type="button"
              disabled={busy}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => void submitPegUpdate()}
            >
              Submit Peg Update On-Chain
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
