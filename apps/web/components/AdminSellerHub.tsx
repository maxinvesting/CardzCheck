"use client";

import { type FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { type Session, type User } from "@supabase/supabase-js";
import { useAccount, useWriteContract } from "wagmi";
import { type Hex } from "viem";
import { getPublicClient } from "@/lib/chain";
import { inventoryVaultAbi, pegOracleAbi } from "@/lib/contracts";
import { publicConfig, zeroAddress } from "@/lib/env";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { getBrowserSupabase } from "@/lib/supabase";
import { computeSkuId } from "@/lib/sku";
import { type AdminListingDetail, type AdminListingRow, type PegUpdateRow, type SoldCompRow } from "@/lib/types";

type AdminProfile = {
  id: string;
  email: string | null;
  role: "admin" | "user";
  walletAddress: string | null;
};

type ListingFormState = {
  name: string;
  imageUrl: string;
  year: string;
  set: string;
  player: string;
  cardNo: string;
  parallel: string;
  grade: string;
  notes: string;
  status: "active" | "paused";
};

type CompFormState = {
  price: string;
  soldAt: string;
  source: string;
  externalId: string;
};

type PegFormState = {
  n: string;
  windowDays: string;
};

type OracleSignedResponse = {
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

const DEFAULT_PAGE_SIZE = 10;
const EMPTY_LISTING_FORM: ListingFormState = {
  name: "",
  imageUrl: "",
  year: "",
  set: "",
  player: "",
  cardNo: "",
  parallel: "",
  grade: "",
  notes: "",
  status: "active",
};
const EMPTY_COMP_FORM: CompFormState = {
  price: "",
  soldAt: "",
  source: "ebay_sold",
  externalId: "",
};
const DEFAULT_PEG_FORM: PegFormState = {
  n: "5",
  windowDays: "30",
};

function shortHex(value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function toLocalDateTimeInput(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - offset * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

function buildListingForm(listing: AdminListingRow): ListingFormState {
  return {
    name: listing.name,
    imageUrl: listing.imageUrl ?? "",
    year: listing.year,
    set: listing.set,
    player: listing.player,
    cardNo: listing.cardNo,
    parallel: listing.parallel,
    grade: listing.grade,
    notes: listing.notes ?? "",
    status: listing.status,
  };
}

function buildValidationErrors(form: ListingFormState): Partial<Record<keyof ListingFormState, string>> {
  const errors: Partial<Record<keyof ListingFormState, string>> = {};

  if (!form.name.trim()) errors.name = "Name is required.";
  if (!form.year.trim()) errors.year = "Year is required.";
  if (!form.set.trim()) errors.set = "Set is required.";
  if (!form.player.trim()) errors.player = "Player is required.";
  if (!form.grade.trim()) errors.grade = "Grade is required.";
  if (form.imageUrl.trim()) {
    try {
      new URL(form.imageUrl.trim());
    } catch {
      errors.imageUrl = "Image URL must be a valid URL.";
    }
  }

  return errors;
}

function normalizeRole(value: string | null | undefined): "admin" | "user" {
  return value === "admin" ? "admin" : "user";
}

function parseProfileRow(user: User, profile: { role?: string | null; wallet_address?: string | null } | null): AdminProfile {
  return {
    id: user.id,
    email: user.email ?? null,
    role: normalizeRole(profile?.role),
    walletAddress: profile?.wallet_address ?? null,
  };
}

export function AdminSellerHub() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const publicClient = useMemo(() => getPublicClient(), []);
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);

  const [items, setItems] = useState<AdminListingRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const deferredSearch = useDeferredValue(searchInput);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminListingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<ListingFormState>(EMPTY_LISTING_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ListingFormState, string>>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [savingListing, setSavingListing] = useState(false);
  const [listingStatusMessage, setListingStatusMessage] = useState<string | null>(null);

  const [quantityToMint, setQuantityToMint] = useState("1");
  const [minting, setMinting] = useState(false);
  const [inventoryStatus, setInventoryStatus] = useState<string | null>(null);

  const [compForm, setCompForm] = useState<CompFormState>({
    ...EMPTY_COMP_FORM,
    soldAt: toLocalDateTimeInput(new Date()),
  });
  const [savingComp, setSavingComp] = useState(false);
  const [compStatus, setCompStatus] = useState<string | null>(null);

  const [pegForm, setPegForm] = useState<PegFormState>(DEFAULT_PEG_FORM);
  const [recomputingPeg, setRecomputingPeg] = useState(false);
  const [pegStatus, setPegStatus] = useState<string | null>(null);

  const selectedListing = detail?.listing ?? null;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  const canUseOwnerWallet =
    address &&
    publicConfig.adminAddress !== zeroAddress &&
    address.toLowerCase() === publicConfig.adminAddress.toLowerCase();

  const previewSkuId = useMemo(() => {
    try {
      if (!form.year.trim() || !form.set.trim() || !form.player.trim() || !form.grade.trim()) {
        return null;
      }

      return computeSkuId({
        year: form.year,
        set: form.set,
        player: form.player,
        cardNo: form.cardNo,
        parallel: form.parallel,
        grade: form.grade,
      });
    } catch {
      return null;
    }
  }, [form.cardNo, form.grade, form.parallel, form.player, form.set, form.year]);

  async function getAccessToken(): Promise<string> {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    const accessToken = currentSession?.access_token;
    if (!accessToken) {
      throw new Error("Admin session expired. Sign in again.");
    }

    return accessToken;
  }

  async function adminFetch<T>(input: string, init?: RequestInit): Promise<T> {
    const accessToken = await getAccessToken();
    const response = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-supabase-access-token": accessToken,
        ...(init?.headers ?? {}),
      },
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
    }

    return payload as T;
  }

  async function ensureProfile(user: User): Promise<AdminProfile> {
    const { error: upsertError } = await supabase.from("users").upsert(
      {
        id: user.id,
        email: user.email ?? null,
      } as never,
      { onConflict: "id" }
    );

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    const { data, error } = await supabase
      .from("users")
      .select("role, wallet_address")
      .eq("id", user.id)
      .maybeSingle<{ role?: string | null; wallet_address?: string | null }>();

    if (error && error.code !== "PGRST116") {
      throw new Error(error.message);
    }

    return parseProfileRow(user, data ?? null);
  }

  async function refreshProfile(nextSession: Session | null) {
    if (!nextSession?.user) {
      setProfile(null);
      return;
    }

    try {
      setAuthError(null);
      const nextProfile = await ensureProfile(nextSession.user);
      setProfile(nextProfile);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to load admin profile");
    }
  }

  async function loadListings(targetPage: number, targetSearch: string) {
    if (!profile || profile.role !== "admin") {
      return;
    }

    setListLoading(true);
    setListError(null);

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(DEFAULT_PAGE_SIZE),
      });
      if (targetSearch.trim()) {
        params.set("search", targetSearch.trim());
      }

      const result = await adminFetch<{ items: AdminListingRow[]; page: number; pageSize: number; total: number }>(
        `/api/admin/listings?${params.toString()}`,
        { method: "GET" }
      );

      setItems(result.items);
      setTotal(result.total);
      if (!selectedSkuId && result.items[0]) {
        setSelectedSkuId(result.items[0].skuId);
      } else if (selectedSkuId && !result.items.some((item) => item.skuId === selectedSkuId) && result.items[0]) {
        setSelectedSkuId(result.items[0].skuId);
      } else if (!result.items.length) {
        setSelectedSkuId(null);
        setDetail(null);
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Failed to load listings");
    } finally {
      setListLoading(false);
    }
  }

  async function loadListingDetail(skuId: string) {
    setDetailLoading(true);
    setDetailError(null);

    try {
      const result = await adminFetch<AdminListingDetail>(`/api/admin/listings?skuId=${skuId}`, { method: "GET" });
      setDetail(result);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Failed to load listing detail");
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshData(nextSelectedSkuId?: string | null) {
    const skuToReload = nextSelectedSkuId ?? selectedSkuId;
    await loadListings(page, deferredSearch);
    if (skuToReload) {
      await loadListingDetail(skuToReload);
    }
  }

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) {
        return;
      }

      if (error) {
        setAuthError(error.message);
      }

      setSession(data.session ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    void refreshProfile(session);
  }, [address, session]);

  useEffect(() => {
    if (!profile || profile.role !== "admin") {
      return;
    }

    void loadListings(page, deferredSearch);
  }, [deferredSearch, page, profile]);

  useEffect(() => {
    if (!selectedSkuId || !profile || profile.role !== "admin") {
      return;
    }

    void loadListingDetail(selectedSkuId);
  }, [profile, selectedSkuId]);

  useEffect(() => {
    if (!detail || editorMode !== "edit") {
      return;
    }

    setForm(buildListingForm(detail.listing));
  }, [detail, editorMode]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setAuthError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signInEmail.trim(),
        password: signInPassword,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    setAuthError(null);
    await supabase.auth.signOut();
    setItems([]);
    setDetail(null);
    setSelectedSkuId(null);
    setEditorOpen(false);
  }

  async function handleLinkWallet() {
    if (!session?.user || !address) {
      return;
    }

    setLinkingWallet(true);
    setWalletStatus(null);

    try {
      const { error } = await supabase
        .from("users")
        .upsert(
          {
            id: session.user.id,
            email: session.user.email ?? null,
            wallet_address: address.toLowerCase(),
          } as never,
          { onConflict: "id" }
        );

      if (error) {
        throw new Error(error.message);
      }

      await refreshProfile(session);
      setWalletStatus(`Linked ${address.toLowerCase()}.`);
    } catch (error) {
      setWalletStatus(error instanceof Error ? error.message : "Failed to link wallet");
    } finally {
      setLinkingWallet(false);
    }
  }

  function openCreateEditor() {
    setEditorMode("create");
    setForm(EMPTY_LISTING_FORM);
    setFormErrors({});
    setEditorOpen(true);
    setListingStatusMessage(null);
  }

  function openEditEditor() {
    if (!selectedListing) {
      return;
    }

    setEditorMode("edit");
    setForm(buildListingForm(selectedListing));
    setFormErrors({});
    setEditorOpen(true);
    setListingStatusMessage(null);
  }

  async function handleSaveListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setListingStatusMessage(null);

    const errors = buildValidationErrors(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSavingListing(true);

    try {
      const payload = {
        ...(editorMode === "edit" && selectedListing ? { skuId: selectedListing.skuId } : {}),
        name: form.name,
        imageUrl: form.imageUrl,
        year: form.year,
        set: form.set,
        player: form.player,
        cardNo: form.cardNo,
        parallel: form.parallel,
        grade: form.grade,
        notes: form.notes,
        status: form.status,
      };

      const result = await adminFetch<{ listing: AdminListingRow }>("/api/admin/listings", {
        method: editorMode === "create" ? "POST" : "PATCH",
        body: JSON.stringify(payload),
      });

      setEditorOpen(false);
      setListingStatusMessage(
        editorMode === "create" ? "Listing created." : `Listing ${shortHex(result.listing.skuId)} updated.`
      );
      setSelectedSkuId(result.listing.skuId);
      await refreshData(result.listing.skuId);
    } catch (error) {
      setListingStatusMessage(error instanceof Error ? error.message : "Failed to save listing");
    } finally {
      setSavingListing(false);
    }
  }

  async function handleToggleStatus(nextStatus: "active" | "paused") {
    if (!selectedListing) {
      return;
    }

    setListingStatusMessage(null);

    try {
      await adminFetch<{ listing: AdminListingRow }>("/api/admin/listings", {
        method: "PATCH",
        body: JSON.stringify({
          skuId: selectedListing.skuId,
          status: nextStatus,
        }),
      });

      setListingStatusMessage(nextStatus === "paused" ? "Listing paused." : "Listing resumed.");
      await refreshData(selectedListing.skuId);
    } catch (error) {
      setListingStatusMessage(error instanceof Error ? error.message : "Failed to change listing status");
    }
  }

  async function handleAdjustQuantity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedListing) {
      return;
    }

    const quantity = Number(quantityToMint);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setInventoryStatus("Quantity must be a positive whole number.");
      return;
    }

    if (!canUseOwnerWallet) {
      setInventoryStatus("Connect the configured owner wallet to mint inventory.");
      return;
    }

    setMinting(true);
    setInventoryStatus("Submitting inventory mint transaction...");

    try {
      const hash = await writeContractAsync({
        address: publicConfig.inventoryVaultAddress,
        abi: inventoryVaultAbi,
        functionName: "mint",
        args: [publicConfig.marketAddress, BigInt(selectedListing.skuId), BigInt(quantity)],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setInventoryStatus(`Inventory updated on-chain: ${hash}`);
      await refreshData(selectedListing.skuId);
    } catch (error) {
      setInventoryStatus(error instanceof Error ? error.message : "Failed to mint inventory");
    } finally {
      setMinting(false);
    }
  }

  async function handleAddComp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedListing) {
      return;
    }

    setSavingComp(true);
    setCompStatus(null);

    try {
      const soldAt = compForm.soldAt ? new Date(compForm.soldAt).toISOString() : "";
      if (!soldAt) {
        throw new Error("Sold at is required.");
      }

      const price = parseUsdc(compForm.price);
      await adminFetch<SoldCompRow>("/api/admin/add-comp", {
        method: "POST",
        body: JSON.stringify({
          skuId: selectedListing.skuId,
          priceCents: price.toString(),
          soldAt,
          source: compForm.source.trim() || "ebay_sold",
          externalId: compForm.externalId.trim() || undefined,
        }),
      });

      setCompForm({
        ...EMPTY_COMP_FORM,
        soldAt: toLocalDateTimeInput(new Date()),
      });
      setCompStatus("Sold comp saved.");
      await loadListingDetail(selectedListing.skuId);
    } catch (error) {
      setCompStatus(error instanceof Error ? error.message : "Failed to save sold comp");
    } finally {
      setSavingComp(false);
    }
  }

  async function handleRecomputePeg() {
    if (!selectedListing) {
      return;
    }

    const n = Number(pegForm.n);
    const windowDays = Number(pegForm.windowDays);
    if (!Number.isInteger(n) || n <= 0) {
      setPegStatus("Use a positive whole number of comps.");
      return;
    }
    if (!Number.isFinite(windowDays) || windowDays <= 0) {
      setPegStatus("Window days must be positive.");
      return;
    }
    if (!address) {
      setPegStatus("Connect a wallet to submit the peg update transaction.");
      return;
    }

    setRecomputingPeg(true);
    setPegStatus("Requesting oracle signature...");

    try {
      const signed = await adminFetch<OracleSignedResponse>("/api/oracle/sign", {
        method: "POST",
        body: JSON.stringify({
          skuId: selectedListing.skuId,
          n,
          windowSeconds: Math.round(windowDays * 86_400),
          chainId: publicConfig.chainId,
          verifyingContract: publicConfig.pegOracleAddress,
        }),
      });

      setPegStatus("Submitting signed peg update on-chain...");
      const hash = await writeContractAsync({
        address: publicConfig.pegOracleAddress,
        abi: pegOracleAbi,
        functionName: "submitPriceUpdate",
        args: [
          {
            skuId: signed.update.skuId,
            pegPrice: BigInt(signed.update.pegPrice),
            method: BigInt(signed.update.method),
            n: BigInt(signed.update.n),
            windowSeconds: BigInt(signed.update.windowSeconds),
            salesHash: signed.update.salesHash,
            observedAt: BigInt(signed.update.observedAt),
            expiry: BigInt(signed.update.expiry),
            nonce: BigInt(signed.update.nonce),
          },
          signed.signature,
        ],
      });

      await publicClient.waitForTransactionReceipt({ hash });
      setPegStatus("Writing peg update audit log...");

      await adminFetch<PegUpdateRow>("/api/admin/log-peg-update", {
        method: "POST",
        body: JSON.stringify({
          skuId: signed.update.skuId,
          pegPrice: signed.update.pegPrice,
          method: Number(signed.update.method),
          n: Number(signed.update.n),
          windowSeconds: Number(signed.update.windowSeconds),
          salesHash: signed.update.salesHash,
          observedAt: new Date(Number(signed.update.observedAt) * 1000).toISOString(),
          nonce: signed.update.nonce,
          txHash: hash,
        }),
      });

      setPegStatus(`Peg refreshed on-chain: ${hash}`);
      await refreshData(selectedListing.skuId);
    } catch (error) {
      setPegStatus(error instanceof Error ? error.message : "Failed to recompute peg");
    } finally {
      setRecomputingPeg(false);
    }
  }

  if (!authReady) {
    return <p className="text-sm text-slate-600">Loading admin mode...</p>;
  }

  if (!session || !profile) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Admin Mode</p>
          <h1 className="text-3xl font-semibold text-slate-950">Supabase-backed Seller Hub</h1>
          <p className="text-sm text-slate-600">
            Sign in with a Supabase account that has <code>public.users.role = 'admin'</code>.
          </p>
        </div>

        <form onSubmit={handleSignIn} className="mt-6 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-900"
              type="email"
              value={signInEmail}
              onChange={(event) => setSignInEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Password</span>
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-slate-900"
              type="password"
              value={signInPassword}
              onChange={(event) => setSignInPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {authError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{authError}</div>
          ) : null}

          <button
            type="submit"
            disabled={signingIn}
            className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {signingIn ? "Signing in..." : "Enter Seller Hub"}
          </button>
        </form>
      </div>
    );
  }

  if (profile.role !== "admin") {
    return (
      <div className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
        <h1 className="text-2xl font-semibold">Account is authenticated, but not an admin</h1>
        <p className="text-sm">
          Signed in as {profile.email ?? profile.id}. Promote this user by setting <code>public.users.role</code> to{" "}
          <code>admin</code> with the service role or another trusted bootstrap path.
        </p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-medium"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Seller Hub</p>
            <h1 className="text-3xl font-semibold text-slate-950">Manage marketplace inventory and pricing</h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Metadata changes stay in Supabase. Inventory mints and peg submissions still use the existing on-chain
              contracts.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:min-w-[32rem]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Signed In</div>
              <div className="mt-1 font-medium text-slate-950">{profile.email ?? profile.id}</div>
              <div className="mt-1 text-xs text-slate-500">Role: {profile.role}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Wallet Link</div>
              <div className="mt-1 font-medium text-slate-950">
                {profile.walletAddress ? shortHex(profile.walletAddress) : "Not linked yet"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Owner wallet for minting:{" "}
                {publicConfig.adminAddress === zeroAddress ? "not configured" : shortHex(publicConfig.adminAddress)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleLinkWallet()}
            disabled={!address || linkingWallet}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {linkingWallet ? "Linking..." : address ? "Link Connected Wallet" : "Connect Wallet to Link"}
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Sign out
          </button>
          {walletStatus ? <span className="text-sm text-slate-600">{walletStatus}</span> : null}
          {authError ? <span className="text-sm text-rose-700">{authError}</span> : null}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Marketplace Listings</h2>
              <p className="text-sm text-slate-600">Search, review status, and jump into a listing editor.</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="Search player, set, name, or SKU"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
              />
              <button
                type="button"
                onClick={openCreateEditor}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
              >
                Create Listing
              </button>
            </div>
          </div>

          {listError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {listError}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-2 py-3 font-medium">Listing</th>
                  <th className="px-2 py-3 font-medium">SKU</th>
                  <th className="px-2 py-3 font-medium">Quantity</th>
                  <th className="px-2 py-3 font-medium">Peg</th>
                  <th className="px-2 py-3 font-medium">Status</th>
                  <th className="px-2 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isSelected = item.skuId === selectedSkuId;

                  return (
                    <tr
                      key={item.skuId}
                      className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${
                        isSelected ? "bg-slate-50" : ""
                      }`}
                      onClick={() => setSelectedSkuId(item.skuId)}
                    >
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-3">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-14 w-10 rounded-lg object-contain"
                            />
                          ) : (
                            <div className="flex h-14 w-10 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-1 text-center text-[9px] text-slate-500">
                              No image available
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-950">{item.name}</div>
                            <div className="truncate text-xs text-slate-500">
                              {item.year} {item.set} · {item.player}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 font-mono text-xs text-slate-600">{shortHex(item.skuId)}</td>
                      <td className="px-2 py-3">{item.availableQuantity}</td>
                      <td className="px-2 py-3">${formatUsdc(BigInt(item.currentPegPrice || "0"))}</td>
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            item.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-slate-500">{formatDateTime(item.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {listLoading ? <p className="mt-4 text-sm text-slate-600">Loading listings...</p> : null}
          {!listLoading && items.length === 0 ? (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No listings yet. Create your first SKU from the Seller Hub.
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <div>
              Page {page} of {totalPages} · {total} total listing{total === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:opacity-60"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Listing Workspace</h2>
                <p className="text-sm text-slate-600">
                  Edit metadata, pause/resume visibility, and work recent comps into the oracle flow.
                </p>
              </div>
              {selectedListing ? (
                <button
                  type="button"
                  onClick={openEditEditor}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
                >
                  Edit Listing
                </button>
              ) : null}
            </div>

            {detailError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {detailError}
              </div>
            ) : null}
            {listingStatusMessage ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {listingStatusMessage}
              </div>
            ) : null}

            {detailLoading ? <p className="mt-4 text-sm text-slate-600">Loading listing detail...</p> : null}

            {selectedListing ? (
              <div className="mt-4 space-y-5">
                <div className="flex gap-4">
                  {selectedListing.imageUrl ? (
                    <img
                      src={selectedListing.imageUrl}
                      alt={selectedListing.name}
                      className="h-32 w-24 rounded-xl object-contain"
                    />
                  ) : (
                    <div className="flex h-32 w-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-xs text-slate-500">
                      No image available
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-slate-950">{selectedListing.name}</h3>
                    <p className="mt-1 font-mono text-xs text-slate-500">{selectedListing.skuId}</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      <div>Available: {selectedListing.availableQuantity}</div>
                      <div>Peg: ${formatUsdc(BigInt(selectedListing.currentPegPrice || "0"))}</div>
                      <div>Status: {selectedListing.status}</div>
                      <div>Observed: {formatDateTime(selectedListing.observedAt)}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedListing.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => void handleToggleStatus("paused")}
                      className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
                    >
                      Pause Listing
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleToggleStatus("active")}
                      className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
                    >
                      Resume Listing
                    </button>
                  )}
                </div>

                <form onSubmit={handleAdjustQuantity} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h4 className="font-medium text-slate-950">Adjust Quantity</h4>
                    <p className="text-sm text-slate-600">
                      Mints inventory into the market contract using the existing owner-controlled vault.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={quantityToMint}
                      onChange={(event) => setQuantityToMint(event.target.value)}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={minting}
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {minting ? "Minting..." : "Mint to Market"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Connected wallet: {address ? shortHex(address) : "not connected"}.
                  </p>
                  {inventoryStatus ? <p className="text-sm text-slate-700">{inventoryStatus}</p> : null}
                </form>

                <form onSubmit={handleAddComp} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h4 className="font-medium text-slate-950">Recent Sold Comp</h4>
                    <p className="text-sm text-slate-600">Add a new sale that can feed the next peg recompute.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Price (USDC)</span>
                      <input
                        value={compForm.price}
                        onChange={(event) => setCompForm((current) => ({ ...current, price: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        placeholder="42.50"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Sold At</span>
                      <input
                        type="datetime-local"
                        value={compForm.soldAt}
                        onChange={(event) => setCompForm((current) => ({ ...current, soldAt: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Source</span>
                      <input
                        value={compForm.source}
                        onChange={(event) => setCompForm((current) => ({ ...current, source: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">External ID</span>
                      <input
                        value={compForm.externalId}
                        onChange={(event) => setCompForm((current) => ({ ...current, externalId: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={savingComp}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    {savingComp ? "Saving..." : "Save Comp"}
                  </button>
                  {compStatus ? <p className="text-sm text-slate-700">{compStatus}</p> : null}
                </form>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h4 className="font-medium text-slate-950">Recompute Peg</h4>
                    <p className="text-sm text-slate-600">
                      Preview recent comps, request an oracle signature, then submit the signed update on-chain.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Max comps</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={pegForm.n}
                        onChange={(event) => setPegForm((current) => ({ ...current, n: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Window (days)</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={pegForm.windowDays}
                        onChange={(event) => setPegForm((current) => ({ ...current, windowDays: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRecomputePeg()}
                    disabled={recomputingPeg}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {recomputingPeg ? "Recomputing..." : "Recompute Peg"}
                  </button>
                  {pegStatus ? <p className="text-sm text-slate-700">{pegStatus}</p> : null}
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-slate-950">Recent Sold Comps</h4>
                    <p className="text-sm text-slate-600">Most recent records used for pricing decisions.</p>
                  </div>
                  <div className="space-y-2">
                    {detail?.recentComps.map((comp) => (
                      <div key={comp.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                        <div className="font-medium text-slate-950">${formatUsdc(BigInt(comp.price_cents))}</div>
                        <div className="text-slate-500">
                          {formatDateTime(comp.sold_at)} · {comp.source ?? "unknown source"}
                        </div>
                      </div>
                    ))}
                    {!detail?.recentComps.length ? (
                      <p className="rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
                        No comps logged yet.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                Select a listing to manage quantity, peg pricing, and visibility.
              </p>
            )}
          </section>

          {editorOpen ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    {editorMode === "create" ? "Create Listing" : "Edit Listing"}
                  </h2>
                  <p className="text-sm text-slate-600">
                    Sellers work in plain card fields. The SKU fingerprint is computed for you.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleSaveListing} className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Computed SKU</div>
                  <div className="mt-1 font-mono text-xs text-slate-700">{previewSkuId ?? "Fill in card fields to preview"}</div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Name</span>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    {formErrors.name ? <span className="text-xs text-rose-700">{formErrors.name}</span> : null}
                  </label>

                  <div className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Images</span>
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      Trusted images only. This prototype no longer accepts manual remote image URLs.
                    </div>
                  </div>

                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Year</span>
                    <input
                      value={form.year}
                      onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    {formErrors.year ? <span className="text-xs text-rose-700">{formErrors.year}</span> : null}
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Set</span>
                    <input
                      value={form.set}
                      onChange={(event) => setForm((current) => ({ ...current, set: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    {formErrors.set ? <span className="text-xs text-rose-700">{formErrors.set}</span> : null}
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Player</span>
                    <input
                      value={form.player}
                      onChange={(event) => setForm((current) => ({ ...current, player: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    {formErrors.player ? <span className="text-xs text-rose-700">{formErrors.player}</span> : null}
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Grade</span>
                    <input
                      value={form.grade}
                      onChange={(event) => setForm((current) => ({ ...current, grade: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    {formErrors.grade ? <span className="text-xs text-rose-700">{formErrors.grade}</span> : null}
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Card No.</span>
                    <input
                      value={form.cardNo}
                      onChange={(event) => setForm((current) => ({ ...current, cardNo: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Parallel</span>
                    <input
                      value={form.parallel}
                      onChange={(event) => setForm((current) => ({ ...current, parallel: event.target.value }))}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">Status</span>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          status: event.target.value === "paused" ? "paused" : "active",
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={savingListing}
                  className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {savingListing ? "Saving..." : editorMode === "create" ? "Create Listing" : "Save Changes"}
                </button>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
