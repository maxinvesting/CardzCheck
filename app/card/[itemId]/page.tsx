"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CardImage as TrustedCardImageFrame } from "@/components/CardImage";
import BusinessInventoryItemEditor from "@/components/business/BusinessInventoryItemEditor";
import {
  estimateTakeHome,
  fmtCents,
} from "@/lib/business/pricing";
import type { BusinessInventoryItem, CardImage, TrustedCardImage } from "@/types";
import { buildEbaySoldUrl } from "@/lib/ebay/comps-url";
import {
  buildBeckettMarketplaceSearchUrl,
  buildComcSearchUrl,
  buildEbaySearchUrl,
  buildFanaticsCollectSearchUrl,
  buildFacebookMarketplaceSearchUrl,
  buildMySlabsSearchUrl,
} from "@/lib/marketplace-search";

// ── Types ────────────────────────────────────────────────────────────

interface ProfileItem {
  id: string;
  card_id?: string | null;
  user_id?: string;
  business_account_id?: string;
  title?: string | null;
  player_name?: string | null;
  year?: string | null;
  set_name?: string | null;
  grade?: string | null;
  grading_company?: string | null;
  cert_number?: string | null;
  parallel_type?: string | null;
  insert?: string | null;
  card_number?: string | null;
  quantity?: number | null;
  status?: string | null;
  channel?: string | null;
  acquisition_type?: "buy" | "trade" | "rip" | "consignment" | "other" | null;
  condition_status?: string | null;
  list_price_cents?: number | null;
  cost_basis_total_cents?: number | null;
  tax_cents?: number | null;
  shipping_cents?: number | null;
  fees_paid_cents?: number | null;
  current_market_value_cents?: number | null;
  acquisition_date?: string | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  notes?: string | null;
  location?: string | null;
  ebay_item_id?: string | null;
  image_url?: string | null;
  image_source?: "psa" | "user" | "none" | null;
  user_image_url?: string | null;
  psa_cert_number?: string | null;
  trusted_image?: TrustedCardImage | null;
  card_images?: CardImage[] | null;
  primary_image?: CardImage | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ProfileSale {
  id: string;
  sale_date: string;
  sale_price_cents: number;
  platform_fees_cents?: number;
  shipping_charged_cents?: number;
  shipping_paid_cents?: number;
  net_proceeds_cents?: number;
  profit_cents?: number;
  order_id?: string | null;
  notes?: string | null;
  channel?: string | null;
  sold_price_cents?: number;
  net_payout_cents?: number;
  sold_at?: string | null;
}

type Mode = "business" | "collection";
type TabId = "details" | "shop";

// ── Helpers ──────────────────────────────────────────────────────────

function pickImageUrl(item: ProfileItem): string | null {
  const certDigits = (item.psa_cert_number ?? item.cert_number ?? "").replace(/\D/g, "");
  const certFallback =
    certDigits.length >= 5
      ? `https://cert-images.psa.com/${certDigits}/large/${certDigits}_f.jpg`
      : null;
  return (
    item.trusted_image?.frontUrl ||
    certFallback ||
    item.image_url ||
    item.user_image_url ||
    item.card_images?.find((image) => typeof image.url === "string" && image.url.length > 0)?.url ||
    null
  );
}

function displayTitle(item: ProfileItem): string {
  if (item.title) return item.title;
  const parts = [item.year, item.player_name, item.set_name, item.grade];
  return parts.filter(Boolean).join(" ") || "Untitled";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

function statusBadge(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  const colors: Record<string, string> = {
    sold: "bg-emerald-900/50 text-emerald-400",
    listed: "bg-blue-900/50 text-blue-400",
    pending_sale: "bg-yellow-900/50 text-yellow-400",
    returned: "bg-red-900/50 text-red-400",
    unlisted: "bg-gray-800 text-gray-400",
  };
  return colors[s] || "bg-gray-800 text-gray-400";
}

function severityBadge(severity: string) {
  switch (severity) {
    case "low":
      return "bg-emerald-900/50 text-emerald-400";
    case "at":
      return "bg-blue-900/50 text-blue-400";
    case "above":
      return "bg-yellow-900/50 text-yellow-400";
    case "well-above":
      return "bg-red-900/50 text-red-400";
    default:
      return "bg-gray-800 text-gray-400";
  }
}

// ── Page Component ───────────────────────────────────────────────────

export default function CardProfilePage() {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const itemId = params.itemId as string;
  const routeIsBusiness = pathname?.startsWith("/business") ?? false;
  const from = ((searchParams.get("from") as Mode) || (routeIsBusiness ? "business" : "collection"));
  const isBusinessMode = routeIsBusiness || from === "business";

  // Data state
  const [item, setItem] = useState<ProfileItem | null>(null);
  const [sales, setSales] = useState<ProfileSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Image zoom
  const [imageZoom, setImageZoom] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageFileInput, setImageFileInput] = useState<File | null>(null);
  const [imageFilePreviewUrl, setImageFilePreviewUrl] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const imageFilePickerRef = useRef<HTMLInputElement | null>(null);

  // Update Price modal
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [updatingPrice, setUpdatingPrice] = useState(false);

  // Mark Sold modal
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [soldForm, setSoldForm] = useState({
    sale_price: "",
    channel: "ebay",
    sale_date: new Date().toISOString().slice(0, 10),
  });
  const [recordingSale, setRecordingSale] = useState(false);

  // Overflow menu
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [activePanel, setActivePanel] = useState<"none" | "inventory">("none");

  // Toast
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const buildProfilePath = useCallback((resolvedId: string, mode: Mode) => {
    if (mode === "business") {
      return `/business/card/${resolvedId}`;
    }
    return `/card/${resolvedId}?from=collection`;
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    if (!isBusinessMode) return;
    const panel = searchParams.get("panel");
    if (panel === "inventory") {
      setActivePanel("inventory");
    } else {
      setActivePanel("none");
    }
  }, [isBusinessMode, searchParams]);

  useEffect(() => {
    if (!imageFileInput) {
      setImageFilePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFileInput);
    setImageFilePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFileInput]);

  // ── Data Loading ─────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    const applyProfile = (data: any, mode: Mode) => {
      setItem(data.item);
      setSales(data.sales ?? []);
    };

    const fetchProfile = async (mode: Mode) => {
      const res = await fetch(`/api/card-profile/${itemId}?from=${mode}`, {
        cache: "no-store",
      });
      if (res.status === 401) return { status: "unauthorized" as const };
      if (res.status === 404) return { status: "not_found" as const };
      if (!res.ok) {
        let message = "Failed to load profile";
        try {
          const body = await res.json();
          if (typeof body?.error === "string" && body.error.trim()) message = body.error;
        } catch {
          // ignore
        }
        return { status: "error" as const, message };
      }
      const data = await res.json();
      return { status: "ok" as const, data };
    };

    setLoading(true);
    setError(null);
    try {
      const primaryMode: Mode = from;
      const primary = await fetchProfile(primaryMode);

      if (primary.status === "unauthorized") {
        router.push("/login");
        return;
      }

      if (primary.status === "ok") {
        const data = primary.data;
        applyProfile(data, primaryMode);
        const resolvedId =
          typeof data?.item?.id === "string" && data.item.id.length > 0
            ? data.item.id
            : itemId;
        if (resolvedId !== itemId) {
          router.replace(buildProfilePath(resolvedId, primaryMode));
        }
        return;
      }

      if (primary.status === "not_found") {
        const fallbackMode: Mode = primaryMode === "business" ? "collection" : "business";
        const fallback = await fetchProfile(fallbackMode);

        if (fallback.status === "unauthorized") {
          router.push("/login");
          return;
        }

        if (fallback.status === "ok") {
          const data = fallback.data;
          applyProfile(data, fallbackMode);
          const resolvedId =
            typeof data?.item?.id === "string" && data.item.id.length > 0
              ? data.item.id
              : itemId;
          router.replace(buildProfilePath(resolvedId, fallbackMode));
          return;
        }

        if (fallback.status === "not_found") {
          setError("Item not found");
          return;
        }

        setError(fallback.status === "error" ? fallback.message : "Failed to load profile");
        return;
      }

      setError(primary.status === "error" ? primary.message : "Failed to load profile");
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [itemId, from, router, buildProfilePath]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Derived State ────────────────────────────────────────────────

  const imageUrl = item ? pickImageUrl(item) : null;
  const trustedImageForFrame = useMemo<TrustedCardImage | null>(() => {
    if (!item) return null;
    if (item.trusted_image?.frontCandidates?.length) return item.trusted_image;

    const certDigits = (item.psa_cert_number ?? item.cert_number ?? "").replace(/\D/g, "");
    if (certDigits.length < 5) return item.trusted_image ?? null;

    const frontCandidates = [
      `https://cert-images.psa.com/${certDigits}/large/${certDigits}_f.jpg`,
      `https://cert-images.psa.com/${certDigits}/large/${certDigits}_front.jpg`,
      `https://cert-images.psa.com/${certDigits}/small/${certDigits}_f.jpg`,
      `https://cert-images.psa.com/${certDigits}/small/${certDigits}_front.jpg`,
    ];
    const backCandidates = [
      `https://cert-images.psa.com/${certDigits}/large/${certDigits}_b.jpg`,
      `https://cert-images.psa.com/${certDigits}/large/${certDigits}_back.jpg`,
      `https://cert-images.psa.com/${certDigits}/small/${certDigits}_b.jpg`,
      `https://cert-images.psa.com/${certDigits}/small/${certDigits}_back.jpg`,
    ];
    const front = frontCandidates[0];
    const back = backCandidates[0];

    return {
      source: "psa",
      frontUrl: front,
      backUrl: back,
      frontCandidates,
      backCandidates,
      hasFallbackCta: false,
    };
  }, [item]);
  const title = item ? displayTitle(item) : "";
  const ebayCompsUrl = item
    ? buildEbaySoldUrl({
        player: item.player_name,
        year: item.year,
        setName: item.set_name,
        parallel: item.parallel_type,
        gradingCompany: item.grading_company,
        grade: item.grade,
        title: item.title ?? title,
      })
    : buildEbaySoldUrl({ title: "sports trading card" });
  const marketplaceLinks = useMemo(() => {
    const params = item
      ? {
          player: item.player_name,
          year: item.year,
          setName: item.set_name,
          parallel: item.parallel_type,
          cardNumber: item.card_number,
          gradingCompany: item.grading_company,
          grade: item.grade,
          title: item.title ?? title,
        }
      : { title: "sports trading card" };

    const q = encodeURIComponent(
      [
        (params as { player?: string }).player,
        (params as { year?: string }).year,
        (params as { setName?: string }).setName,
        (params as { parallel?: string }).parallel,
        (params as { gradingCompany?: string }).gradingCompany,
        (params as { grade?: string }).grade,
      ]
        .filter(Boolean)
        .join(" ")
    );
    const playerQ = encodeURIComponent((params as { player?: string }).player ?? "");

    return [
      {
        label: "eBay Sold",
        description: "Completed & sold listings",
        href: buildEbaySoldUrl(params as Parameters<typeof buildEbaySoldUrl>[0]),
      },
      {
        label: "eBay Active",
        description: "Current buy it now & auctions",
        href: buildEbaySearchUrl(params),
      },
      {
        label: "130point",
        description: "eBay sold comps aggregator",
        href: `https://www.130point.com/sales?q=${q}`,
      },
      {
        label: "PWCC",
        description: "Premium auctions & weekly",
        href: `https://www.pwccmarketplace.com/marketplace?query=${q}`,
      },
      {
        label: "Goldin",
        description: "High-end card auctions",
        href: `https://goldin.co/search?q=${playerQ}`,
      },
      {
        label: "MySlabs",
        description: "Graded slab marketplace",
        href: buildMySlabsSearchUrl(params),
      },
      {
        label: "COMC",
        description: "Raw & graded marketplace",
        href: buildComcSearchUrl(params),
      },
      {
        label: "Fanatics Collect",
        description: "Buy now marketplace",
        href: buildFanaticsCollectSearchUrl(params),
      },
      {
        label: "Beckett",
        description: "Price guide & market data",
        href: buildBeckettMarketplaceSearchUrl(params),
      },
      {
        label: "Alt",
        description: "Fractional & direct sales",
        href: `https://app.alt.xyz/search?q=${playerQ}`,
      },
    ];
  }, [item, title]);

  const takeHome = useMemo(() => {
    if (!item) return [];
    return estimateTakeHome(item.list_price_cents);
  }, [item]);

  const costCents = useMemo(() => {
    if (!item) return null;
    if (typeof item.cost_basis_total_cents === "number") return item.cost_basis_total_cents;
    if (typeof item.purchase_price === "number") return Math.round(item.purchase_price * 100);
    return null;
  }, [item]);

  const marketValue = useMemo(() => {
    if (!item || item.current_market_value_cents == null) return null;
    const qty = item.quantity ?? 1;
    return item.current_market_value_cents * qty;
  }, [item]);

  // Unrealized P/L
  const plData = useMemo(() => {
    if (costCents == null || !item?.current_market_value_cents) return null;
    const qty = item.quantity ?? 1;
    const cmvTotal = item.current_market_value_cents * qty;
    const diff = cmvTotal - costCents;
    const pct = costCents > 0 ? (diff / costCents) * 100 : 0;
    return { diff, pct };
  }, [item, costCents]);

  // ── Actions ──────────────────────────────────────────────────────

  const handleUpdatePrice = async () => {
    if (!item || updatingPrice) return;
    const parsed = parseFloat(newPrice);
    if (isNaN(parsed) || parsed < 0) return;
    const cents = Math.round(parsed * 100);

    setUpdatingPrice(true);
    try {
      const res = await fetch("/api/business/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, list_price_cents: cents }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItem((prev) =>
          prev ? { ...prev, list_price_cents: updated.list_price_cents ?? cents } : prev
        );
        setShowPriceModal(false);
        setNewPrice("");
        setToast({ type: "success", message: "Price updated" });
      } else {
        setToast({ type: "error", message: "Failed to update price" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to update price" });
    } finally {
      setUpdatingPrice(false);
    }
  };

  const handleMarkSold = async () => {
    if (!item || recordingSale) return;
    const priceParsed = parseFloat(soldForm.sale_price);
    if (isNaN(priceParsed) || priceParsed <= 0) return;
    const priceCents = Math.round(priceParsed * 100);

    setRecordingSale(true);
    try {
      const res = await fetch("/api/business/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: item.id,
          sold_price_cents: priceCents,
          channel: soldForm.channel,
          sold_at: soldForm.sale_date,
          platform_fees_cents: 0,
          shipping_charged_cents: 0,
          shipping_cost_cents: 0,
          tax_cents: 0,
        }),
      });
      if (res.ok) {
        const sale = await res.json();
        setSales((prev) => [sale, ...prev]);
        setItem((prev) => (prev ? { ...prev, status: "sold" } : prev));
        setShowSoldModal(false);
        setSoldForm({ sale_price: "", channel: "ebay", sale_date: new Date().toISOString().slice(0, 10) });
        setToast({ type: "success", message: "Sale recorded" });
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", message: data.error || "Failed to record sale" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to record sale" });
    } finally {
      setRecordingSale(false);
    }
  };

  const handleUploadImage = async () => {
    if (!item || savingImage) return;
    if (!imageFileInput) {
      setToast({ type: "error", message: "Choose an image file to upload" });
      return;
    }

    setSavingImage(true);
    try {
      if (!imageFileInput.type.startsWith("image/")) {
        setToast({ type: "error", message: "Please choose an image file" });
        return;
      }
      if (imageFileInput.size > MAX_IMAGE_UPLOAD_BYTES) {
        setToast({ type: "error", message: "Image must be under 10MB" });
        return;
      }

      const formData = new FormData();
      formData.append("front", imageFileInput);

      const res = await fetch(`/api/cards/${item.id}/images`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        setToast({ type: "error", message: "Failed to upload image" });
        return;
      }

      await loadProfile();
      setImageFileInput(null);
      if (imageFilePickerRef.current) {
        imageFilePickerRef.current.value = "";
      }
      setShowImageModal(false);
      setToast({ type: "success", message: "Image uploaded" });
    } catch {
      setToast({ type: "error", message: "Failed to upload image" });
    } finally {
      setSavingImage(false);
    }
  };

  const handleSaveBusinessInventoryItem = async (
    id: string,
    updates: Partial<BusinessInventoryItem>
  ) => {
    try {
      const res = await fetch("/api/business/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) {
        setToast({ type: "error", message: "Failed to save item" });
        return;
      }
      await loadProfile();
      setToast({ type: "success", message: "Item saved" });
    } catch {
      setToast({ type: "error", message: "Failed to save item" });
    }
  };

  const openImageModal = () => {
    setImageFileInput(null);
    if (imageFilePickerRef.current) {
      imageFilePickerRef.current.value = "";
    }
    setShowImageModal(true);
  };

  const handleImageFileSelection = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setImageFileInput(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setToast({ type: "error", message: "Please choose an image file" });
      event.target.value = "";
      setImageFileInput(null);
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setToast({ type: "error", message: "Image must be under 10MB" });
      event.target.value = "";
      setImageFileInput(null);
      return;
    }
    setImageFileInput(file);
  };

  // ── Render: Loading / Error ──────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#F6FAF7", fontFamily: "'Sora', sans-serif" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading card…</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "#F6FAF7", fontFamily: "'Sora', sans-serif" }}
      >
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm max-w-sm w-full">
          <p className="text-lg font-semibold text-gray-800 mb-2">{error || "Item not found"}</p>
          <button
            onClick={() => router.push(isBusinessMode ? "/business" : "/collection")}
            className="mt-4 px-6 py-2.5 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            style={{ background: "#146B42" }}
          >
            {isBusinessMode ? "Back to Inventory" : "Back to Collection"}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Profile ──────────────────────────────────────────────

  const gradeCompany = (item.grading_company ?? "PSA").toUpperCase();
  const certNum = item.psa_cert_number ?? item.cert_number;
  const playerName = item.player_name ?? item.title ?? "Unknown Player";
  const baseSetLabel = [item.year, item.set_name].filter(Boolean).join(" ");
  const parallelLabel = item.parallel_type || item.insert || null;
  const setLabel = [baseSetLabel, parallelLabel].filter(Boolean).join(" | ") || "Sports Card";
  const displayPlayerName = item.card_number
    ? `#${item.card_number} ${playerName}`
    : playerName;

  const tabs: { id: TabId; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "shop", label: "Comps" },
  ];
  const businessItemForEditor =
    isBusinessMode && item ? (item as unknown as BusinessInventoryItem) : null;

  const palette = {
    appBg: "#F6FAF7",
    panelBg: "#FFFFFF",
    subtleGreen: "#EAF6EE",
    border: "#DCE9E1",
    text: "#101A14",
    muted: "#6F7D74",
    accent: "#1C8C58",
    accentDark: "#146B42",
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(circle at 10% 0%, ${palette.subtleGreen} 0%, ${palette.appBg} 45%, #FFFFFF 100%)`,
        fontFamily: "'Sora', sans-serif",
      }}
    >
      <div className="max-w-[1100px] mx-auto px-4 py-8">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push(isBusinessMode ? "/business" : "/collection")}
            className="flex items-center gap-1.5 text-sm transition-colors px-3 py-1.5 rounded-full border"
            style={{ color: palette.muted, borderColor: palette.border, background: "#FFFFFFCC" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {isBusinessMode ? "Back to Inventory" : "Back to Collection"}
          </button>
        </div>

        {/* Main card */}
        <div
          className="flex overflow-hidden"
          style={{
            background: palette.panelBg,
            borderRadius: 24,
            border: `1px solid ${palette.border}`,
            boxShadow: "0 14px 40px rgba(16, 40, 26, 0.08)",
          }}
        >
          {/* ── LEFT PANEL ───────────────────────────────────────── */}
          <div
            className="shrink-0 flex flex-col"
            style={{
              width: 380,
              background: "linear-gradient(180deg, #F7FCF9 0%, #F1F8F4 100%)",
              borderRight: `1px solid ${palette.border}`,
            }}
          >
            {/* Image area */}
            <div className="relative flex flex-col items-center" style={{ flex: 1 }}>
              {/* Card image */}
              <div className="relative w-full flex items-center justify-center py-6 px-8">
                <div
                  className={`block ${imageUrl ? "cursor-zoom-in" : "cursor-default"}`}
                  style={{ width: 260 }}
                  onClick={() => {
                    if (imageUrl) {
                      setImageZoom(true);
                    }
                  }}
                  role={imageUrl ? "button" : undefined}
                  tabIndex={imageUrl ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (imageUrl && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setImageZoom(true);
                    }
                  }}
                >
                  <TrustedCardImageFrame
                    image={trustedImageForFrame}
                    alt={title}
                    className="w-full rounded-[8px] bg-white"
                    imageClassName="transition-transform duration-200 hover:scale-[1.02]"
                    fallbackClassName="bg-[#F4F1EC]"
                    allowUploadCta={!imageUrl}
                    ctaLabel="Add image"
                    onCtaClick={openImageModal}
                  />
                </div>
              </div>

            </div>

            {/* 3 ghost icon buttons */}
            <div
              className="flex items-center justify-center gap-3 px-6 py-4"
              style={{ borderTop: `1px solid ${palette.border}` }}
            >
              {/* Cert / PSA lookup */}
              {certNum ? (
                <a
                  href={`https://www.psacard.com/cert/${certNum}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View PSA Cert"
                  className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors"
                  style={{ border: "1.5px solid #DDDBD6", background: "transparent" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </a>
              ) : (
                <div
                  title="No PSA cert number"
                  className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-300"
                  style={{ border: "1.5px solid #E9E7E2", background: "transparent" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
              )}

              {/* Change image */}
              <button
                onClick={openImageModal}
                title="Upload image"
                className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors"
                style={{ border: "1.5px solid #DDDBD6", background: "transparent" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {/* Fullscreen */}
              <button
                onClick={() => imageUrl && setImageZoom(true)}
                disabled={!imageUrl}
                title="View fullscreen"
                className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-500 hover:text-gray-800 hover:border-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ border: "1.5px solid #DDDBD6", background: "transparent" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── RIGHT PANEL ──────────────────────────────────────── */}
          <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
            <div style={{ padding: "32px 32px 0 32px" }}>
              {/* 1. Set tag */}
              <p
                className="uppercase tracking-widest mb-2"
                style={{ fontSize: 10, color: palette.muted, fontWeight: 600 }}
              >
                {setLabel}
              </p>

              {/* 2. Player name */}
              <h1
                className="leading-tight mb-5"
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: palette.text,
                  lineHeight: 1.1,
                }}
              >
                {displayPlayerName}
              </h1>

              {/* 3. Price section */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div style={{ border: `1px solid ${palette.border}`, borderRadius: 14, padding: "14px 16px", background: "#FBFEFC" }}>
                  <p className="uppercase tracking-widest mb-2" style={{ fontSize: 9, color: palette.muted, fontWeight: 600 }}>
                    Market Estimate
                  </p>
                  {marketValue ? (
                    <p style={{ fontSize: 26, fontWeight: 700, color: palette.text, lineHeight: 1 }}>
                      {fmtCents(marketValue)}
                    </p>
                  ) : (
                    <p style={{ fontSize: 26, fontWeight: 700, color: "#C0BDBA", lineHeight: 1 }}>—</p>
                  )}
                </div>
                <div style={{ border: `1px solid ${palette.border}`, borderRadius: 14, padding: "14px 16px", background: "#FBFEFC" }}>
                  <p className="uppercase tracking-widest mb-2" style={{ fontSize: 9, color: palette.muted, fontWeight: 600 }}>
                    eBay Comps
                  </p>
                  <a
                    href={ebayCompsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold hover:underline"
                    style={{ fontSize: 16, color: palette.accentDark }}
                  >
                    View Sold
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* 4. Primary CTA + Item Actions */}
              <div className="flex items-center gap-2 mb-6">
                <button
                  onClick={() => setActiveTab("shop")}
                  className="flex-1 flex items-center justify-center py-3 text-white font-semibold text-sm transition-colors"
                  style={{ background: palette.accentDark, borderRadius: 12, border: "none", cursor: "pointer" }}
                >
                  View Comps
                </button>
                {isBusinessMode && (
                  <button
                    onClick={() => setActivePanel("inventory")}
                    className="inline-flex items-center justify-center h-[46px] px-4 text-sm font-semibold text-white transition-colors"
                    style={{ background: "#1C8C58", borderRadius: 12 }}
                  >
                    Edit Inventory
                  </button>
                )}
                <div className="relative" ref={overflowRef}>
                  <button
                    onClick={() => setShowOverflow((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-semibold transition-colors hover:bg-gray-50"
                    style={{
                      height: 46,
                      paddingLeft: 14,
                      paddingRight: 14,
                      borderRadius: 12,
                      border: `1.5px solid ${palette.border}`,
                      color: palette.text,
                      background: "#FFFFFF",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Item Actions
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showOverflow && (
                    <div
                      className="absolute right-0 top-12 z-30 py-1 min-w-[160px]"
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        border: `1px solid ${palette.border}`,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      }}
                    >
                      {isBusinessMode ? (
                        <button
                          onClick={() => {
                            setShowOverflow(false);
                            setActivePanel("inventory");
                          }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                          style={{ color: palette.text }}
                        >
                          Edit Inventory
                        </button>
                      ) : (
                        <Link
                          href={`/cards/${item.id}`}
                          onClick={() => setShowOverflow(false)}
                          className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                          style={{ color: palette.text }}
                        >
                          Edit
                        </Link>
                      )}
                      {isBusinessMode && item.status !== "sold" && (
                        <button
                          onClick={() => { setShowOverflow(false); setShowSoldModal(true); }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                          style={{ color: palette.text }}
                        >
                          Mark Sold
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowOverflow(false);
                          openImageModal();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                        style={{ color: palette.text }}
                      >
                        {imageUrl ? "Change Image" : "Set Image"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 6. Data grid */}
              <div className="grid gap-2 mb-6" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {/* Cert Number */}
                <DataCell label="Cert Number">
                  {certNum ? (
                    <a
                      href={`https://www.psacard.com/cert/${certNum}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#2563EB",
                        textDecoration: "underline",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      {certNum}
                    </a>
                  ) : (
                    <EmptyCell />
                  )}
                </DataCell>

                {/* Grade */}
                <DataCell label="Grade">
                  {item.grade ? (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#0F0E0D", fontSize: 13 }}>
                      {gradeCompany} {item.grade}
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </DataCell>

                {/* My Cost */}
                <DataCell label="My Cost">
                  {costCents != null ? (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#0F0E0D", fontSize: 13 }}>
                      {fmtCents(costCents)}
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </DataCell>

                {/* Date Acquired */}
                <DataCell label="Date Acquired">
                  {item.acquisition_date || item.purchase_date ? (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#0F0E0D", fontSize: 13 }}>
                      {fmtDate(item.acquisition_date ?? item.purchase_date)}
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </DataCell>

                {/* My Value */}
                <DataCell label="My Value">
                  {item.list_price_cents != null ? (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#0F0E0D", fontSize: 13 }}>
                      {fmtCents(item.list_price_cents)}
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </DataCell>

                {/* Source */}
                <DataCell label="Source">
                  {item.channel ? (
                    <span
                      className="capitalize"
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "#0F0E0D", fontSize: 13 }}
                    >
                      {item.channel}
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </DataCell>
              </div>

              {/* 7. Tab bar */}
              <div
                className="flex items-center gap-6 -mx-8 px-8"
                style={{ borderTop: `1.5px solid ${palette.border}` }}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="relative text-sm font-medium transition-colors py-3"
                    style={{
                      color: activeTab === tab.id ? palette.text : palette.muted,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <span
                        className="absolute top-0 left-0 right-0"
                        style={{ height: 2, background: palette.accentDark, borderRadius: "0 0 2px 2px" }}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto px-8 py-6">
              {/* Details tab */}
              {activeTab === "details" && (
                <div className="space-y-1">
                  <div className="grid grid-cols-2 gap-x-8">
                    <FactRow label="Condition" value={item.condition_status} />
                    <FactRow label="Grading Company" value={item.grading_company} />
                    <FactRow label="Year" value={item.year} />
                    <FactRow label="Set" value={item.set_name} />
                    <FactRow label="Parallel" value={item.parallel_type} />
                    <FactRow label="Insert" value={item.insert} />
                    <FactRow label="Quantity" value={item.quantity != null ? String(item.quantity) : null} />
                    <FactRow label="Status" value={item.status} />
                  </div>

                  {item.notes && (
                    <div className="mt-4 p-3 rounded-xl" style={{ background: "#F8FCFA", border: "1px solid #DCE9E1" }}>
                      <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Notes</p>
                      <p className="text-sm text-gray-700">{item.notes}</p>
                    </div>
                  )}

                  {isBusinessMode && takeHome.length > 0 && (
                    <div className="mt-4 p-3 rounded-xl" style={{ background: "#F8FCFA", border: "1px solid #DCE9E1" }}>
                      <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Est. Take-Home at List Price</p>
                      <div className="space-y-1">
                        {takeHome.map((th) => (
                          <div key={th.channel} className="flex justify-between text-sm">
                            <span className="text-gray-500 capitalize">
                              {th.channel}{" "}
                              <span className="text-gray-400 text-xs">({(th.feeRate * 100).toFixed(1)}%)</span>
                            </span>
                            <span className="font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {fmtCents(th.netCents)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Shop tab */}
              {activeTab === "shop" && (
                <div className="py-8">
                  <div className="mb-4">
                    <p
                      className="uppercase tracking-widest mb-2"
                      style={{ fontSize: 9, color: palette.muted, fontWeight: 600 }}
                    >
                      Marketplace Comps
                    </p>
                    <p className="text-sm max-w-md" style={{ color: "#9D9A97" }}>
                      Search this card across every major platform — sold comps, active listings, and price guides.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {marketplaceLinks.map((marketplace) => (
                      <a
                        key={marketplace.label}
                        href={marketplace.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center justify-between gap-3 p-4 transition-colors hover:bg-[#F8FCFA]"
                        style={{
                          border: `1px solid ${palette.border}`,
                          borderRadius: 16,
                          background: "#FFFFFF",
                        }}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold" style={{ color: palette.text }}>
                            {marketplace.label}
                          </p>
                          <p className="text-xs mt-1" style={{ color: palette.muted }}>
                            {marketplace.description}
                          </p>
                        </div>
                        <svg
                          className="w-4 h-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                          fill="none"
                          stroke={palette.accentDark}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isBusinessMode && activePanel === "inventory" && businessItemForEditor && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/35" onClick={() => setActivePanel("none")} />
          <div
            className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto"
            style={{
              background: "#FFFFFF",
              borderLeft: "1px solid #DCE9E1",
              boxShadow: "0 12px 40px rgba(16, 40, 26, 0.16)",
            }}
          >
            <BusinessInventoryItemEditor
              item={businessItemForEditor}
              onSave={handleSaveBusinessInventoryItem}
              onClose={() => setActivePanel("none")}
              tone="light"
              showOpenProfileLink={false}
            />
          </div>
        </div>
      )}

      {/* ── Image Zoom Modal ─────────────────────────────────────────── */}
      {imageZoom && imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setImageZoom(false)}
        >
          <img
            src={imageUrl}
            alt={title}
            className="max-w-full max-h-[90vh] object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setImageZoom(false)}
            className="absolute top-4 right-4 p-2 rounded-full text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Update Price Modal ───────────────────────────────────────── */}
      {showPriceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-gray-900">
              {isBusinessMode ? "Update List Price" : "Set Price"}
            </h3>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleUpdatePrice(); }}
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                style={{ border: "1.5px solid #E4E2DE", fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPriceModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                style={{ border: "1.5px solid #E4E2DE", color: "#6B6864" }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePrice}
                disabled={updatingPrice}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:bg-gray-800 transition-colors"
                style={{ background: "#111", borderRadius: 11 }}
              >
                {updatingPrice ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark Sold Modal ──────────────────────────────────────────── */}
      {showSoldModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold mb-4 text-gray-900">Mark Sold</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                  Sold Price ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={soldForm.sale_price}
                  onChange={(e) => setSoldForm((f) => ({ ...f, sale_price: e.target.value }))}
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  style={{ border: "1.5px solid #E4E2DE", fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                  Channel
                </label>
                <select
                  value={soldForm.channel}
                  onChange={(e) => setSoldForm((f) => ({ ...f, channel: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  style={{ border: "1.5px solid #E4E2DE" }}
                >
                  <option value="ebay">eBay</option>
                  <option value="whatnot">Whatnot</option>
                  <option value="instagram">Instagram</option>
                  <option value="show">Show</option>
                  <option value="local">Local</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                  Sold Date
                </label>
                <input
                  type="date"
                  value={soldForm.sale_date}
                  onChange={(e) => setSoldForm((f) => ({ ...f, sale_date: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
                  style={{ border: "1.5px solid #E4E2DE" }}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowSoldModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                style={{ border: "1.5px solid #E4E2DE", color: "#6B6864" }}
              >
                Cancel
              </button>
              <button
                onClick={handleMarkSold}
                disabled={recordingSale || !soldForm.sale_price}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:bg-gray-800 transition-colors"
                style={{ background: "#111", borderRadius: 11 }}
              >
                {recordingSale ? "Recording…" : "Record Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Image Modal ─────────────────────────────────────── */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-4">Upload Image</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">
                  Upload a real card photo
                </label>
                <input
                  ref={imageFilePickerRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileSelection}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => imageFilePickerRef.current?.click()}
                  className="w-full px-3 py-2 border border-gray-700 rounded-lg text-gray-200 hover:bg-gray-800 text-sm text-left"
                >
                  {imageFileInput ? imageFileInput.name : "Choose image file"}
                </button>
                {imageFilePreviewUrl && (
                  <img
                    src={imageFilePreviewUrl}
                    alt="Selected upload preview"
                    className="w-full max-h-52 object-contain rounded-lg border border-gray-800 bg-gray-950"
                  />
                )}
                {imageFileInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageFileInput(null);
                      if (imageFilePickerRef.current) {
                        imageFilePickerRef.current.value = "";
                      }
                    }}
                    className="text-xs text-gray-400 hover:text-gray-200"
                  >
                    Clear selected file
                  </button>
                )}
                <p className="text-xs text-gray-500">
                  PSA images are used automatically when a valid cert image exists. Uploaded images are used when no PSA image is available.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setShowImageModal(false);
                  setImageFileInput(null);
                  if (imageFilePickerRef.current) {
                    imageFilePickerRef.current.value = "";
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadImage}
                disabled={savingImage || !imageFileInput}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:bg-gray-800 transition-colors"
                style={{ background: "#111", borderRadius: 11 }}
              >
                {savingImage ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white"
          style={{
            background: toast.type === "success" ? "#16A34A" : "#DC2626",
            fontFamily: "'Sora', sans-serif",
            fontSize: 14,
          }}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="opacity-75 hover:opacity-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function DataCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-1.5 p-3 rounded-[11px]"
      style={{ background: "#FBFEFC", border: "1px solid #DCE9E1" }}
    >
      <span
        className="uppercase tracking-widest"
        style={{ fontSize: 9, color: "#6F7D74", fontWeight: 600 }}
      >
        {label}
      </span>
      <div className="text-sm leading-tight">{children}</div>
    </div>
  );
}

function EmptyCell() {
  return (
    <span style={{ color: "#C0BDBA", fontWeight: 400, fontSize: 20, lineHeight: 1 }}>+</span>
  );
}

function FactRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div
      className="flex justify-between items-center py-1.5"
      style={{ borderBottom: "1px solid #ECF4EF" }}
    >
      <span className="text-xs font-medium" style={{ color: "#6F7D74" }}>{label}</span>
      <span className="text-xs font-medium capitalize" style={{ color: "#101A14" }}>{value}</span>
    </div>
  );
}
