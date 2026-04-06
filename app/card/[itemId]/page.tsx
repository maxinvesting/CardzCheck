"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  estimateTakeHome,
  fmtCents,
} from "@/lib/business/pricing";
import { useGradeEstimateFromImages } from "@/lib/grading/useGradeEstimateFromImages";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";
import type { WorthGradingResult } from "@/types";
import { buildEbaySoldUrl } from "@/lib/ebay/comps-url";

// ── Types ────────────────────────────────────────────────────────────

interface ProfileItem {
  id: string;
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
  condition_status?: string | null;
  list_price_cents?: number | null;
  cost_basis_total_cents?: number | null;
  current_market_value_cents?: number | null;
  acquisition_date?: string | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  notes?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  stock_image_url?: string | null;
  ebay_image_url?: string | null;
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
  return (
    item.user_image_url ||
    item.stock_image_url ||
    item.ebay_image_url ||
    item.image_url ||
    null
  );
}

function displayTitle(item: ProfileItem): string {
  if (item.title) return item.title;
  const parts = [item.year, item.player_name, item.set_name, item.grade];
  return parts.filter(Boolean).join(" ") || "Untitled";
}

function buildGradeSearchTerm(
  grade?: string | null,
  gradingCompany?: string | null
): string | null {
  const normalizedGrade = grade?.trim();
  if (!normalizedGrade) return null;
  if (/^(PSA|BGS|SGC|CGC)\s/i.test(normalizedGrade)) {
    return normalizedGrade;
  }
  return `${(gradingCompany || "PSA").toUpperCase()} ${normalizedGrade}`;
}

function buildEbayActiveSearchQuery(item: ProfileItem, fallbackTitle: string): string {
  const rawTitle = item.title?.trim();
  if (rawTitle && !/^(PSA|BGS|SGC|CGC)?\s*\d+(\.\d+)?$/i.test(rawTitle)) {
    return rawTitle;
  }

  const identityParts = [
    item.year,
    item.player_name,
    item.set_name,
    item.parallel_type,
    item.insert,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  const gradePart = buildGradeSearchTerm(item.grade, item.grading_company);
  const parts = identityParts.length > 0 && gradePart
    ? [...identityParts, gradePart]
    : identityParts;
  if (parts.length > 0) return parts.join(" ");
  if (gradePart) return gradePart;
  if (fallbackTitle.trim()) return fallbackTitle.trim();
  return "sports trading card";
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

function isValidHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const itemId = params.itemId as string;
  const from = (searchParams.get("from") as Mode) || "collection";
  const isBusinessMode = from === "business";

  // Data state
  const [item, setItem] = useState<ProfileItem | null>(null);
  const [sales, setSales] = useState<ProfileSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Image zoom
  const [imageZoom, setImageZoom] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageFileInput, setImageFileInput] = useState<File | null>(null);
  const [imageFilePreviewUrl, setImageFilePreviewUrl] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const imageFilePickerRef = useRef<HTMLInputElement | null>(null);
  const attemptedImageHydrationRef = useRef(false);

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

  // Toast
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Business grade estimate + worth-grading summary
  const [cardForGrade, setCardForGrade] = useState<{
    imageUrls: string[];
    cardIdentity: GradeEstimatorCardInput;
  } | null>(null);
  const [valueResult, setValueResult] = useState<WorthGradingResult | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

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

      if (mode === "business" && data.item) {
        const businessItem = data.item as ProfileItem;
        const imageCandidates = [
          businessItem.user_image_url,
          businessItem.stock_image_url,
          businessItem.ebay_image_url,
          businessItem.image_url,
        ].filter((u): u is string => typeof u === "string" && u.length > 0);
        if (imageCandidates.length > 0) {
          const cardIdentity: GradeEstimatorCardInput = {
            player_name: businessItem.player_name ?? businessItem.title ?? "",
            year: businessItem.year ?? undefined,
            set_name: businessItem.set_name ?? undefined,
            card_number: undefined,
            parallel_type: businessItem.parallel_type ?? undefined,
            variation: businessItem.insert ?? undefined,
            insert: undefined,
          };
          setCardForGrade({
            imageUrls: imageCandidates,
            cardIdentity,
          });
        } else {
          setCardForGrade(null);
        }
      } else {
        setCardForGrade(null);
      }
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
          router.replace(`/card/${resolvedId}?from=${primaryMode}`);
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
          router.replace(`/card/${resolvedId}?from=${fallbackMode}`);
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
  }, [itemId, from, router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    attemptedImageHydrationRef.current = false;
  }, [itemId, from]);

  // ── Derived State ────────────────────────────────────────────────

  const imageUrl = item ? pickImageUrl(item) : null;
  const title = item ? displayTitle(item) : "";
  const ebayActiveSearchQuery = item
    ? buildEbayActiveSearchQuery(item, title)
    : "sports trading card";
  const ebayActiveSearchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(
    ebayActiveSearchQuery
  )}&_sacat=212`;
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

  useEffect(() => {
    if (!isBusinessMode || !item || imageUrl || attemptedImageHydrationRef.current) {
      return;
    }
    attemptedImageHydrationRef.current = true;

    let cancelled = false;
    fetch(`/api/business/inventory/fetch-cmv?item_id=${encodeURIComponent(item.id)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (cancelled || !data) return;
        const updatedItem = data.item as Partial<ProfileItem> | undefined;
        if (updatedItem) {
          setItem((prev) => (prev ? { ...prev, ...updatedItem } : prev));
          return;
        }
        const stockImage = typeof data.stock_image_url === "string" ? data.stock_image_url : null;
        const ebayImage = typeof data.ebay_image_url === "string" ? data.ebay_image_url : null;
        if (stockImage || ebayImage) {
          setItem((prev) =>
            prev
              ? {
                  ...prev,
                  stock_image_url: prev.stock_image_url || stockImage,
                  ebay_image_url: prev.ebay_image_url || ebayImage,
                }
              : prev
          );
        }
      })
      .catch(() => {
        // Best-effort background hydration for missing image data.
      });

    return () => {
      cancelled = true;
    };
  }, [isBusinessMode, item, imageUrl]);

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

  const gradeEstimate = useGradeEstimateFromImages({
    imageUrls: cardForGrade?.imageUrls ?? [],
    card: cardForGrade?.cardIdentity ?? null,
  });

  const fetchWorthGrading = useCallback(async () => {
    if (!cardForGrade?.cardIdentity || !gradeEstimate.estimate?.grade_probabilities) return;
    setValueLoading(true);
    setValueError(null);
    try {
      const response = await fetch("/api/grade-estimator/value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: cardForGrade.cardIdentity,
          gradeProbabilities: gradeEstimate.estimate.grade_probabilities,
          estimatorConfidence: gradeEstimate.estimate.grade_probabilities.confidence,
        }),
      });
      if (!response.ok) throw new Error("POST_GRADING_VALUE_UNAVAILABLE");
      const result: WorthGradingResult = await response.json();
      setValueResult(result);
    } catch {
      setValueResult(null);
      setValueError("Unable to estimate post-grading value right now.");
    } finally {
      setValueLoading(false);
    }
  }, [cardForGrade, gradeEstimate.estimate]);

  useEffect(() => {
    if (!cardForGrade?.cardIdentity || !gradeEstimate.estimate?.grade_probabilities) {
      setValueResult(null);
      setValueError(null);
      setValueLoading(false);
      return;
    }
    void fetchWorthGrading();
  }, [cardForGrade, gradeEstimate.estimate, fetchWorthGrading]);

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
          sale_price_cents: priceCents,
          channel: soldForm.channel,
          sale_date: soldForm.sale_date,
          platform_fees_cents: 0,
          shipping_charged_cents: 0,
          shipping_paid_cents: 0,
          other_costs_cents: 0,
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
        setToast({ type: "error", message: "Failed to record sale" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to record sale" });
    } finally {
      setRecordingSale(false);
    }
  };

  const handleSaveImageUrl = async () => {
    if (!item || savingImage) return;
    const trimmed = imageUrlInput.trim();
    if (!imageFileInput && trimmed && !isValidHttpUrl(trimmed)) {
      setToast({
        type: "error",
        message: "Please enter a full image URL that starts with http:// or https://",
      });
      return;
    }

    setSavingImage(true);
    try {
      let payloadUrl: string | null = trimmed || null;
      if (imageFileInput) {
        if (!imageFileInput.type.startsWith("image/")) {
          setToast({ type: "error", message: "Please choose an image file" });
          return;
        }
        if (imageFileInput.size > MAX_IMAGE_UPLOAD_BYTES) {
          setToast({ type: "error", message: "Image must be under 10MB" });
          return;
        }

        const supabase = createSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setToast({ type: "error", message: "Please log in to upload images" });
          return;
        }

        const sanitizedName = imageFileInput.name.replace(/[^\w.-]+/g, "_");
        const extension = sanitizedName.includes(".")
          ? sanitizedName.split(".").pop()
          : imageFileInput.type.split("/")[1] || "jpg";
        const randomPart = Math.random().toString(36).slice(2, 10);
        const storagePath = `${user.id}/profile/${Date.now()}-${randomPart}.${extension}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("card-images")
          .upload(storagePath, imageFileInput, {
            cacheControl: "3600",
            contentType: imageFileInput.type || undefined,
            upsert: false,
          });

        if (uploadError) {
          setToast({ type: "error", message: "Failed to upload image" });
          return;
        }

        payloadUrl = supabase.storage
          .from("card-images")
          .getPublicUrl(uploadData.path).data.publicUrl;
      }
      const endpoint = isBusinessMode
        ? "/api/business/inventory"
        : `/api/cards/${item.id}`;
      const body = isBusinessMode
        ? { id: item.id, user_image_url: payloadUrl }
        : { user_image_url: payloadUrl };

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setToast({ type: "error", message: "Failed to save image" });
        return;
      }

      if (isBusinessMode) {
        const updated = await res.json().catch(() => null);
        setItem((prev) =>
          prev
            ? {
                ...prev,
                user_image_url:
                  typeof updated?.user_image_url === "string"
                    ? updated.user_image_url
                    : payloadUrl,
              }
            : prev
        );
      } else {
        const response = await res.json().catch(() => null);
        const updatedCard = response?.card as Partial<ProfileItem> | undefined;
        setItem((prev) =>
          prev
            ? {
                ...prev,
                user_image_url:
                  typeof updatedCard?.user_image_url === "string"
                    ? updatedCard.user_image_url
                    : payloadUrl,
                image_url:
                  typeof updatedCard?.image_url === "string"
                    ? updatedCard.image_url
                    : prev.image_url,
              }
            : prev
        );
      }

      setImageFileInput(null);
      if (imageFilePickerRef.current) {
        imageFilePickerRef.current.value = "";
      }
      setShowImageModal(false);
      setToast({
        type: "success",
        message: payloadUrl ? "Image saved" : "Image removed",
      });
    } catch {
      setToast({ type: "error", message: "Failed to save image" });
    } finally {
      setSavingImage(false);
    }
  };

  const openImageModal = (currentUrl: string | null) => {
    setImageUrlInput(currentUrl ?? "");
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
    setImageUrlInput("");
  };

  // ── Render: Loading / Error ──────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#EEECE8", fontFamily: "'Sora', sans-serif" }}
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
        style={{ background: "#EEECE8", fontFamily: "'Sora', sans-serif" }}
      >
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm max-w-sm w-full">
          <p className="text-lg font-semibold text-gray-800 mb-2">{error || "Item not found"}</p>
          <button
            onClick={() => router.push(isBusinessMode ? "/business" : "/collection")}
            className="mt-4 px-6 py-2.5 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
            style={{ background: "#111" }}
          >
            {isBusinessMode ? "Back to Inventory" : "Back to Collection"}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Profile ──────────────────────────────────────────────

  const marketValue = item.current_market_value_cents;
  const gradeCompany = (item.grading_company ?? "PSA").toUpperCase();
  const gradeNum = item.grade ?? "—";
  const certNum = item.cert_number;
  const playerName = item.player_name ?? item.title ?? "Unknown Player";
  const baseSetLabel = [item.year, item.set_name].filter(Boolean).join(" ");
  const parallelLabel = item.parallel_type || item.insert || null;
  const setLabel = [baseSetLabel, parallelLabel].filter(Boolean).join(" | ") || "Sports Card";
  const displayPlayerName = item.card_number
    ? `#${item.card_number} ${playerName}`
    : playerName;

  const tabs: { id: TabId; label: string }[] = [
    { id: "details", label: "Details" },
    { id: "shop", label: "Shop" },
  ];

  return (
    <div
      className="min-h-screen"
      style={{ background: "#EEECE8", fontFamily: "'Sora', sans-serif" }}
    >
      <div className="max-w-[1100px] mx-auto px-4 py-8">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => router.push(isBusinessMode ? "/business" : "/collection")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
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
            background: "#fff",
            borderRadius: 20,
            boxShadow: "0 4px 40px rgba(0,0,0,0.08)",
          }}
        >
          {/* ── LEFT PANEL ───────────────────────────────────────── */}
          <div
            className="shrink-0 flex flex-col"
            style={{ width: 380, background: "#F7F6F2", borderRadius: "20px 0 0 20px" }}
          >
            {/* Image area */}
            <div className="relative flex flex-col items-center" style={{ flex: 1 }}>
              {/* PSA-style slab label */}
              <div
                className="w-full flex items-center justify-between px-3 py-2"
                style={{ background: "#fff", borderBottom: "1px solid #E8E6E1" }}
              >
                <div
                  className="flex flex-col gap-0.5 leading-none"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: "#555" }}
                >
                  {item.set_name && (
                    <span className="uppercase tracking-widest">{item.set_name}</span>
                  )}
                  <span className="uppercase tracking-widest font-semibold" style={{ color: "#1a1a1a" }}>
                    {playerName}
                  </span>
                  {item.insert && (
                    <span className="uppercase tracking-widest">{item.insert}</span>
                  )}
                </div>
                <div
                  className="font-bold leading-none"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, color: "#C8102E" }}
                >
                  {gradeNum}
                </div>
              </div>

              {/* Card image */}
              <div className="relative w-full flex items-center justify-center py-6 px-8">
                {imageUrl ? (
                  <div
                    className="relative cursor-pointer"
                    style={{ width: 260, height: 360 }}
                    onClick={() => setImageZoom(true)}
                  >
                    <Image
                      src={imageUrl}
                      alt={title}
                      fill
                      unoptimized
                      className="object-contain hover:scale-[1.02] transition-transform duration-200"
                    />
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center"
                    style={{
                      width: 260,
                      height: 360,
                      borderRadius: 8,
                      background: "linear-gradient(160deg, #0b1f3a 0%, #1f4d78 100%)",
                    }}
                  >
                    <svg className="w-16 h-16 mb-2 opacity-30" fill="none" stroke="white" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-white/40 text-xs font-medium tracking-wide">No Image</p>
                  </div>
                )}
              </div>

              {/* Player name bar */}
              <div
                className="w-full px-4 py-2.5"
                style={{ background: "rgba(10,15,28,0.72)" }}
              >
                <p className="text-white font-semibold text-sm truncate" style={{ fontFamily: "'Sora', sans-serif" }}>
                  {playerName}
                </p>
                {item.year && (
                  <p className="text-white/50 text-xs mt-0.5">{item.year}</p>
                )}
              </div>
            </div>

            {/* 3 ghost icon buttons */}
            <div
              className="flex items-center justify-center gap-3 px-6 py-4"
              style={{ borderTop: "1px solid #E8E6E1" }}
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
                  className="w-full aspect-[3/4] flex flex-col items-center justify-center text-gray-500 cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => openImageModal(null)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-400">Add your photo</p>
                  <p className="text-xs text-gray-600 mt-1">Upload from your files</p>
                </div>
              )}

              {/* Change image */}
              <button
                onClick={() => { setImageUrlInput(imageUrl ?? ""); setShowImageModal(true); }}
                title="Change image"
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
                style={{ fontSize: 10, color: "#B0ADA8", fontWeight: 500 }}
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
                  color: "#0F0E0D",
                  lineHeight: 1.1,
                }}
              >
                {displayPlayerName}
              </h1>

              {/* 3. Price section */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div style={{ border: "1px solid #E8E6E1", borderRadius: 12, padding: "14px 16px" }}>
                  <p className="uppercase tracking-widest mb-2" style={{ fontSize: 9, color: "#B0ADA8", fontWeight: 500 }}>
                    Market Estimate
                  </p>
                  {marketValue ? (
                    <p style={{ fontSize: 26, fontWeight: 700, color: "#0F0E0D", lineHeight: 1 }}>
                      {fmtCents(marketValue)}
                    </p>
                  ) : (
                    <p style={{ fontSize: 26, fontWeight: 700, color: "#C0BDBA", lineHeight: 1 }}>—</p>
                  )}
                </div>
                <div style={{ border: "1px solid #E8E6E1", borderRadius: 12, padding: "14px 16px" }}>
                  <p className="uppercase tracking-widest mb-2" style={{ fontSize: 9, color: "#B0ADA8", fontWeight: 500 }}>
                    eBay Comps
                  </p>
                  <a
                    href={ebayCompsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold hover:underline"
                    style={{ fontSize: 16, color: "#2563EB" }}
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
                <a
                  href={ebayCompsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center py-3 text-white font-semibold text-sm transition-colors hover:bg-gray-800"
                  style={{ background: "#111", borderRadius: 12 }}
                >
                  Find Comps on eBay
                </a>
                <div className="relative" ref={overflowRef}>
                  <button
                    onClick={() => setShowOverflow((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-semibold transition-colors hover:bg-gray-50"
                    style={{
                      height: 46,
                      paddingLeft: 14,
                      paddingRight: 14,
                      borderRadius: 12,
                      border: "1.5px solid #E4E2DE",
                      color: "#3D3A37",
                      background: "#fff",
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
                        border: "1px solid #E4E2DE",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      }}
                    >
                      {isBusinessMode ? (
                        <button
                          onClick={() => { setShowOverflow(false); setImageUrlInput(imageUrl ?? ""); setShowImageModal(true); }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                          style={{ color: "#3D3A37" }}
                        >
                          Edit
                        </button>
                      ) : (
                        <Link
                          href={`/cards/${item.id}`}
                          onClick={() => setShowOverflow(false)}
                          className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                          style={{ color: "#3D3A37" }}
                        >
                          Edit
                        </Link>
                      )}
                      {isBusinessMode && item.status !== "sold" && (
                        <button
                          onClick={() => { setShowOverflow(false); setShowSoldModal(true); }}
                          className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                          style={{ color: "#3D3A37" }}
                        >
                          Mark Sold
                        </button>
                      )}
                      <button
                        onClick={() => { setShowOverflow(false); setImageUrlInput(imageUrl ?? ""); setShowImageModal(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                        style={{ color: "#3D3A37" }}
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
                style={{ borderTop: "1.5px solid #EBEBEA" }}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="relative text-sm font-medium transition-colors py-3"
                    style={{
                      color: activeTab === tab.id ? "#0F0E0D" : "#A09D9A",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <span
                        className="absolute top-0 left-0 right-0"
                        style={{ height: 2, background: "#0F0E0D", borderRadius: "0 0 2px 2px" }}
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
                    <div className="mt-4 p-3 rounded-xl" style={{ background: "#F7F6F2", border: "1px solid #EBEBEA" }}>
                      <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">Notes</p>
                      <p className="text-sm text-gray-700">{item.notes}</p>
                    </div>
                  )}

                  {isBusinessMode && cardForGrade && gradeEstimate.estimate && (
                    <div className="mt-4 p-3 rounded-xl" style={{ background: "#F7F6F2", border: "1px solid #EBEBEA" }}>
                      <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Grade Estimate</p>
                      <p className="text-sm text-gray-700">
                        Most likely: PSA {gradeEstimate.estimate.estimated_grade_low}–{gradeEstimate.estimate.estimated_grade_high}
                        {gradeEstimate.estimate.grade_probabilities?.confidence && (
                          <span className="text-gray-400 ml-2">· {gradeEstimate.estimate.grade_probabilities.confidence} confidence</span>
                        )}
                      </p>
                      {valueResult && (
                        <p className="text-sm text-gray-700 mt-1">
                          Should grade?{" "}
                          <span className="font-semibold text-emerald-600">
                            {valueResult.rating === "strong_yes"
                              ? "Strong Yes"
                              : valueResult.rating === "yes"
                              ? "Yes"
                              : valueResult.rating === "maybe"
                              ? "Maybe"
                              : "No"}
                          </span>
                          {valueResult.bestOption !== "none" && (
                            <span className="text-gray-400 ml-2">· Best: {valueResult.bestOption.toUpperCase()}</span>
                          )}
                        </p>
                      )}
                      {!valueResult && valueLoading && (
                        <p className="text-xs text-gray-400 mt-1">Analyzing grading value…</p>
                      )}
                      {valueError && (
                        <button onClick={() => void fetchWorthGrading()} className="mt-1 text-xs text-blue-500 hover:text-blue-400">
                          Retry analysis
                        </button>
                      )}
                    </div>
                  )}

                  {isBusinessMode && takeHome.length > 0 && (
                    <div className="mt-4 p-3 rounded-xl" style={{ background: "#F7F6F2", border: "1px solid #EBEBEA" }}>
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
                <div className="flex flex-col items-center justify-center py-10 gap-4">
                  <p className="text-sm text-center max-w-xs" style={{ color: "#9D9A97" }}>
                    Search for comparable listings on eBay to track live market prices.
                  </p>
                  <a
                    href={ebayCompsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
                    style={{ background: "#111", borderRadius: 11 }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Find Comps on eBay
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
            <h3 className="text-lg font-semibold mb-4">Set Image</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">
                  Upload from your files
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
              </div>
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">
                  Or paste an image URL (optional)
                </label>
                <input
                  type="url"
                  value={imageUrlInput}
                  onChange={(e) => {
                    setImageUrlInput(e.target.value);
                    if (imageFileInput) {
                      setImageFileInput(null);
                      if (imageFilePickerRef.current) {
                        imageFilePickerRef.current.value = "";
                      }
                    }
                  }}
                  placeholder="https://..."
                  autoFocus
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500">
                  Leave both file and URL blank to remove your custom image.
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
                onClick={handleSaveImageUrl}
                disabled={savingImage}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 hover:bg-gray-800 transition-colors"
                style={{ background: "#111", borderRadius: 11 }}
              >
                {savingImage ? "Saving…" : "Save"}
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
      style={{ background: "#F7F6F2", border: "1px solid #EBEBEA" }}
    >
      <span
        className="uppercase tracking-widest"
        style={{ fontSize: 9, color: "#C0BDBA", fontWeight: 500 }}
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
      style={{ borderBottom: "1px solid #F3F2F0" }}
    >
      <span className="text-xs font-medium" style={{ color: "#A09D9A" }}>{label}</span>
      <span className="text-xs font-medium capitalize" style={{ color: "#3D3A37" }}>{value}</span>
    </div>
  );
}
