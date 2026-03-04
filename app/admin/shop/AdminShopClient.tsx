"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ShopListing } from "@/types/shop";
import {
  calculateEbayParityPrice,
  calculateEbayFees,
} from "@/lib/ebay-parity";
import {
  EBAY_FEE_RATES,
  EBAY_FEE_LABELS,
  type EbayFeeProfile,
} from "@/contexts/EbaySettingsContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ListingStatus = "active" | "delisted" | "sold" | "draft";
type GradeOption =
  | "Raw"
  | "PSA 10"
  | "PSA 9"
  | "BGS 9.5"
  | "SGC 10"
  | "Other";

type ImageItem =
  | { id: string; kind: "existing"; url: string }
  | { id: string; kind: "pending"; file: File; previewUrl: string };

interface ListingFormState {
  player_name: string;
  year: string;
  set_brand: string;
  parallel_variant: string;
  card_number: string;
  grade_choice: GradeOption;
  grade_other: string;
  cert_number: string;
  sport: "Football" | "Basketball" | "Baseball" | "Other";
  price: string;
  cmv: string;
  cost_basis: string;
  ebay_sold_comp: string;
  price_override: boolean;
  shipping_cost: string;
  status: ListingStatus;
  featured: boolean;
  is_premium: boolean;
  tags: string;
  notes: string;
  description: string;
  quantity: string;
}

type TableSortKey = "margin" | "price" | "date" | "status" | "cost_basis";
type TableSortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRADE_OPTIONS: GradeOption[] = [
  "Raw",
  "PSA 10",
  "PSA 9",
  "BGS 9.5",
  "SGC 10",
  "Other",
];

const SPORT_OPTIONS: ListingFormState["sport"][] = [
  "Football",
  "Basketball",
  "Baseball",
  "Other",
];

const STATUS_OPTIONS: ListingStatus[] = ["draft", "active", "delisted", "sold"];

const STATUS_COLORS: Record<ListingStatus, string> = {
  draft: "bg-slate-600/20 text-slate-300 border-slate-600",
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-600",
  delisted: "bg-amber-500/15 text-amber-300 border-amber-600",
  sold: "bg-cyan-500/15 text-cyan-300 border-cyan-600",
};

const DEFAULT_FORM: ListingFormState = {
  player_name: "",
  year: "",
  set_brand: "",
  parallel_variant: "",
  card_number: "",
  grade_choice: "Raw",
  grade_other: "",
  cert_number: "",
  sport: "Football",
  price: "",
  cmv: "",
  cost_basis: "",
  ebay_sold_comp: "",
  price_override: false,
  shipping_cost: "4.00",
  status: "draft",
  featured: false,
  is_premium: false,
  tags: "",
  notes: "",
  description: "",
  quantity: "1",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createImageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function revokePendingUrls(images: ImageItem[]) {
  for (const image of images) {
    if (image.kind === "pending") {
      URL.revokeObjectURL(image.previewUrl);
    }
  }
}

function extractGrade(listing: ShopListing): {
  grade_choice: GradeOption;
  grade_other: string;
} {
  const grade = listing.grade || "Raw";
  const directMatch = GRADE_OPTIONS.find((option) => option === grade);
  if (directMatch && directMatch !== "Other") {
    return { grade_choice: directMatch, grade_other: "" };
  }
  return { grade_choice: "Other", grade_other: grade };
}

function listingToForm(listing: ShopListing): ListingFormState {
  const grade = extractGrade(listing);
  return {
    player_name: listing.player_name || "",
    year: listing.year ? String(listing.year) : "",
    set_brand: listing.set_brand || "",
    parallel_variant: listing.parallel_variant || "",
    card_number: listing.card_number || "",
    grade_choice: grade.grade_choice,
    grade_other: grade.grade_other,
    cert_number: listing.cert_number || "",
    sport: SPORT_OPTIONS.includes(listing.sport as ListingFormState["sport"])
      ? (listing.sport as ListingFormState["sport"])
      : "Other",
    price: listing.price != null ? String(listing.price) : "",
    cmv: listing.cmv != null ? String(listing.cmv) : "",
    cost_basis:
      listing.cost_basis != null ? String(listing.cost_basis) : "",
    ebay_sold_comp:
      (listing as ShopListing & { ebay_sold_comp?: number | null })
        .ebay_sold_comp != null
        ? String(
            (listing as ShopListing & { ebay_sold_comp?: number | null })
              .ebay_sold_comp
          )
        : "",
    price_override: true, // when editing, treat as override since price already set
    shipping_cost:
      listing.shipping_cost != null ? String(listing.shipping_cost) : "4.00",
    status: STATUS_OPTIONS.includes(listing.status as ListingStatus)
      ? (listing.status as ListingStatus)
      : "active",
    featured: Boolean(listing.featured),
    is_premium: Boolean(listing.is_premium),
    tags: Array.isArray(listing.tags) ? listing.tags.join(", ") : "",
    notes: listing.notes || "",
    description: listing.description || "",
    quantity: listing.quantity != null ? String(listing.quantity) : "1",
  };
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formToPayload(form: ListingFormState) {
  const price = Number(form.price);
  const year = Number(form.year);
  const shippingCost = Number(form.shipping_cost);
  const cmv = form.cmv.trim() ? Number(form.cmv) : null;
  const costBasis = form.cost_basis.trim() ? Number(form.cost_basis) : null;
  const ebaySoldComp = form.ebay_sold_comp.trim()
    ? Number(form.ebay_sold_comp)
    : null;
  const quantity = form.quantity.trim() ? Number(form.quantity) : 1;

  if (!form.player_name.trim()) throw new Error("Player name is required.");
  if (!Number.isFinite(year) || year <= 0) throw new Error("Year is required.");
  if (!form.set_brand.trim()) throw new Error("Set/brand is required.");
  if (!Number.isFinite(price) || price < 0)
    throw new Error("Price must be a valid number.");
  if (!Number.isFinite(shippingCost) || shippingCost < 0)
    throw new Error("Shipping cost must be 0 or greater.");
  if (cmv != null && (!Number.isFinite(cmv) || cmv < 0))
    throw new Error("CMV must be empty or a valid number.");

  const grade =
    form.grade_choice === "Other"
      ? form.grade_other.trim() || "Raw"
      : form.grade_choice;

  return {
    player_name: form.player_name.trim(),
    year,
    set_brand: form.set_brand.trim(),
    parallel_variant: form.parallel_variant.trim() || null,
    card_number: form.card_number.trim() || null,
    grade,
    cert_number: form.cert_number.trim() || null,
    sport: form.sport,
    price,
    cmv,
    cost_basis: costBasis,
    ebay_sold_comp: ebaySoldComp,
    shipping_cost: shippingCost,
    status: form.status,
    featured: form.featured,
    is_premium: form.is_premium,
    tags: parseTags(form.tags),
    notes: form.notes.trim() || null,
    description: form.description.trim() || null,
    quantity: Math.max(1, Math.trunc(quantity)),
  };
}

function toImageItemsFromUrls(urls: string[]): ImageItem[] {
  return urls.map((url) => ({
    id: createImageId(),
    kind: "existing",
    url,
  }));
}

function cloneListingForCreate(listing: ShopListing) {
  return {
    player_name: listing.player_name,
    year: listing.year,
    set_brand: listing.set_brand,
    parallel_variant: listing.parallel_variant,
    card_number: listing.card_number,
    grade: listing.grade,
    cert_number: listing.cert_number,
    sport: listing.sport,
    price: listing.price,
    cmv: listing.cmv,
    cost_basis: listing.cost_basis ?? null,
    ebay_sold_comp:
      (listing as ShopListing & { ebay_sold_comp?: number | null })
        .ebay_sold_comp ?? null,
    shipping_cost: listing.shipping_cost,
    status: listing.status,
    featured: listing.featured,
    is_premium: listing.is_premium,
    tags: listing.tags,
    notes: listing.notes,
    description: listing.description,
    image_urls: listing.image_urls,
    thumbnail_url: listing.thumbnail_url,
    quantity: Math.max(
      1,
      (listing.quantity ?? 1) - (listing.quantity_sold ?? 0)
    ),
  };
}

function computeMargin(
  price: number | undefined | null,
  costBasis: number | undefined | null
): number | null {
  if (!price || !costBasis || costBasis <= 0) return null;
  return ((price - costBasis) / costBasis) * 100;
}

function formatUsd(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ImageManager({
  images,
  setImages,
  uploaderId,
}: {
  images: ImageItem[];
  setImages: React.Dispatch<React.SetStateAction<ImageItem[]>>;
  uploaderId: string;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );
    if (nextFiles.length === 0) return;
    setImages((previous) => [
      ...previous,
      ...nextFiles.map((file) => ({
        id: createImageId(),
        kind: "pending" as const,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  };

  const removeImage = (id: string) => {
    setImages((previous) => {
      const target = previous.find((image) => image.id === id);
      if (target?.kind === "pending") URL.revokeObjectURL(target.previewUrl);
      return previous.filter((image) => image.id !== id);
    });
  };

  const moveImage = (id: string, direction: -1 | 1) => {
    setImages((previous) => {
      const index = previous.findIndex((image) => image.id === id);
      if (index < 0) return previous;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= previous.length) return previous;
      const next = [...previous];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <label
        htmlFor={uploaderId}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={`block cursor-pointer rounded-xl border border-dashed p-4 text-center text-sm transition-colors ${
          isDragging
            ? "border-cyan-400 bg-cyan-500/10 text-cyan-200"
            : "border-gray-700 bg-gray-900/40 text-gray-400 hover:border-gray-500 hover:text-gray-200"
        }`}
      >
        <input
          id={uploaderId}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        Drag & drop photos here, or click to upload
      </label>

      {images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => {
            const src =
              image.kind === "existing" ? image.url : image.previewUrl;
            return (
              <div
                key={image.id}
                className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
              >
                <div className="aspect-square bg-black/30">
                  <img
                    src={src}
                    alt="Listing preview"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="space-y-2 px-2 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">
                      {index === 0 ? "Thumbnail" : `Image ${index + 1}`}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        image.kind === "existing"
                          ? "bg-gray-800 text-gray-300"
                          : "bg-cyan-900/50 text-cyan-300"
                      }`}
                    >
                      {image.kind === "existing" ? "Saved" : "New"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveImage(image.id, -1)}
                      disabled={index === 0}
                      className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 disabled:opacity-40"
                    >
                      &larr;
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(image.id, 1)}
                      disabled={index === images.length - 1}
                      className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 disabled:opacity-40"
                    >
                      &rarr;
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="ml-auto rounded border border-rose-800 px-2 py-1 text-xs text-rose-300 hover:border-rose-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// eBay Parity Calculator Widget
// ---------------------------------------------------------------------------

function EbayParityCalculator({ shopPrice }: { shopPrice: number }) {
  const [profile, setProfile] = useState<EbayFeeProfile>("standard");
  const feeRate = EBAY_FEE_RATES[profile];
  const ebayPrice = calculateEbayParityPrice(shopPrice, feeRate);
  const ebayFees = calculateEbayFees(ebayPrice, feeRate);

  if (!shopPrice || shopPrice <= 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-cyan-300">
          eBay Parity Price
        </h4>
        <select
          value={profile}
          onChange={(e) => setProfile(e.target.value as EbayFeeProfile)}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200"
        >
          {(Object.keys(EBAY_FEE_LABELS) as EbayFeeProfile[]).map((key) => (
            <option key={key} value={key}>
              {EBAY_FEE_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">
            Shop Price
          </p>
          <p className="text-lg font-semibold tabular-nums text-white">
            {formatUsd(shopPrice)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">
            eBay Price
          </p>
          <p className="text-lg font-semibold tabular-nums text-cyan-300">
            {formatUsd(ebayPrice)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500">
            eBay Fees
          </p>
          <p className="text-lg font-semibold tabular-nums text-rose-400">
            -{formatUsd(ebayFees)}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        List at {formatUsd(ebayPrice)} on eBay to net the same{" "}
        {formatUsd(shopPrice)} after {Math.round(feeRate * 100)}% fees.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listing Form Fields
// ---------------------------------------------------------------------------

function ListingFields({
  form,
  setForm,
}: {
  form: ListingFormState;
  setForm: React.Dispatch<React.SetStateAction<ListingFormState>>;
}) {
  const shopPrice = Number(form.price) || 0;

  // Auto-calculate price at 95% of eBay Sold Comp when comp changes
  // (only if price_override is false)
  const handleEbaySoldCompChange = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, ebay_sold_comp: value };
      const compVal = Number(value);
      if (compVal > 0 && !prev.price_override) {
        next.price = (compVal * 0.95).toFixed(2);
      }
      return next;
    });
  };

  const handlePriceChange = (value: string) => {
    setForm((prev) => ({ ...prev, price: value, price_override: true }));
  };

  const resetPriceToComp = () => {
    const compVal = Number(form.ebay_sold_comp);
    if (compVal > 0) {
      setForm((prev) => ({
        ...prev,
        price: (compVal * 0.95).toFixed(2),
        price_override: false,
      }));
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600/30";

  return (
    <div className="space-y-4">
      {/* Card identity fields */}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Player name *</span>
          <input
            value={form.player_name}
            onChange={(e) =>
              setForm((p) => ({ ...p, player_name: e.target.value }))
            }
            className={inputClass}
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Year *</span>
          <input
            type="number"
            value={form.year}
            onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
            className={inputClass}
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Set / brand *</span>
          <input
            value={form.set_brand}
            onChange={(e) =>
              setForm((p) => ({ ...p, set_brand: e.target.value }))
            }
            className={inputClass}
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Parallel variant</span>
          <input
            value={form.parallel_variant}
            onChange={(e) =>
              setForm((p) => ({ ...p, parallel_variant: e.target.value }))
            }
            className={inputClass}
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Card number</span>
          <input
            value={form.card_number}
            onChange={(e) =>
              setForm((p) => ({ ...p, card_number: e.target.value }))
            }
            className={inputClass}
          />
        </label>

        <div className="space-y-1 text-sm">
          <span className="text-gray-300">Grade *</span>
          <select
            value={form.grade_choice}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                grade_choice: e.target.value as GradeOption,
              }))
            }
            className={inputClass}
          >
            {GRADE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {form.grade_choice === "Other" && (
          <label className="space-y-1 text-sm">
            <span className="text-gray-300">Custom grade</span>
            <input
              value={form.grade_other}
              onChange={(e) =>
                setForm((p) => ({ ...p, grade_other: e.target.value }))
              }
              className={inputClass}
              placeholder="e.g. PSA 8"
            />
          </label>
        )}

        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Cert number</span>
          <input
            value={form.cert_number}
            onChange={(e) =>
              setForm((p) => ({ ...p, cert_number: e.target.value }))
            }
            className={inputClass}
          />
        </label>

        <div className="space-y-1 text-sm">
          <span className="text-gray-300">Sport *</span>
          <select
            value={form.sport}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                sport: e.target.value as ListingFormState["sport"],
              }))
            }
            className={inputClass}
          >
            {SPORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <label className="space-y-1 text-sm">
          <span className="text-gray-300">Quantity *</span>
          <input
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) =>
              setForm((p) => ({ ...p, quantity: e.target.value }))
            }
            className={inputClass}
            required
          />
        </label>
      </div>

      {/* Description / condition notes */}
      <label className="block space-y-1 text-sm">
        <span className="text-gray-300">Card description / condition notes</span>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) =>
            setForm((p) => ({ ...p, description: e.target.value }))
          }
          className={inputClass}
          placeholder="Describe the card condition, centering, surface quality, etc."
        />
      </label>

      {/* Pricing section */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-4">
        <h4 className="text-sm font-semibold text-gray-200">
          Pricing & Cost
        </h4>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-amber-400 font-medium">
              Cost Basis (private)
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.cost_basis}
              onChange={(e) =>
                setForm((p) => ({ ...p, cost_basis: e.target.value }))
              }
              className={inputClass}
              placeholder="What you paid"
            />
            <span className="text-[11px] text-gray-500">
              Never shown to buyers.
            </span>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-gray-300">
              eBay Sold Comp
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.ebay_sold_comp}
              onChange={(e) => handleEbaySoldCompChange(e.target.value)}
              className={inputClass}
              placeholder="Reference eBay sold price"
            />
            <span className="text-[11px] text-gray-500">
              Shop price auto-calculates at 95% of this value.
            </span>
          </label>

          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Shop Price *</span>
              {form.price_override &&
                Number(form.ebay_sold_comp) > 0 && (
                  <button
                    type="button"
                    onClick={resetPriceToComp}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300"
                  >
                    Reset to 95%
                  </button>
                )}
            </div>
            <input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => handlePriceChange(e.target.value)}
              className={inputClass}
              required
            />
            {form.price_override && Number(form.ebay_sold_comp) > 0 && (
              <span className="text-[11px] text-amber-400">
                Price manually overridden (auto = {formatUsd(Number(form.ebay_sold_comp) * 0.95)})
              </span>
            )}
          </div>

          <label className="space-y-1 text-sm">
            <span className="text-gray-300">Est. Market Value</span>
            <input
              type="number"
              step="0.01"
              value={form.cmv}
              onChange={(e) =>
                setForm((p) => ({ ...p, cmv: e.target.value }))
              }
              className={inputClass}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-gray-300">Shipping cost *</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.shipping_cost}
              onChange={(e) =>
                setForm((p) => ({ ...p, shipping_cost: e.target.value }))
              }
              className={inputClass}
              required
            />
          </label>

          <div className="space-y-1 text-sm">
            <span className="text-gray-300">Status *</span>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  status: e.target.value as ListingStatus,
                }))
              }
              className={inputClass}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Margin display */}
        {Number(form.cost_basis) > 0 && Number(form.price) > 0 && (
          <div className="flex items-center gap-4 rounded-lg bg-gray-800/50 px-4 py-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                Margin
              </span>
              <p
                className={`text-lg font-bold tabular-nums ${
                  computeMargin(Number(form.price), Number(form.cost_basis))! >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {computeMargin(
                  Number(form.price),
                  Number(form.cost_basis)
                )!.toFixed(1)}
                %
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                Profit
              </span>
              <p
                className={`text-lg font-bold tabular-nums ${
                  Number(form.price) - Number(form.cost_basis) >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                }`}
              >
                {formatUsd(
                  Number(form.price) - Number(form.cost_basis)
                )}
              </p>
            </div>
          </div>
        )}

        {/* eBay Parity Calculator */}
        <EbayParityCalculator shopPrice={shopPrice} />
      </div>

      {/* Tags, notes, checkboxes */}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-gray-300">Tags (comma-separated)</span>
          <input
            value={form.tags}
            onChange={(e) =>
              setForm((p) => ({ ...p, tags: e.target.value }))
            }
            className={inputClass}
            placeholder="rookie, prizm, color match"
          />
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-gray-300">Private notes (admin only)</span>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) =>
              setForm((p) => ({ ...p, notes: e.target.value }))
            }
            className={inputClass}
          />
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) =>
              setForm((p) => ({ ...p, featured: e.target.checked }))
            }
            className="rounded border-gray-600"
          />
          Featured
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={form.is_premium}
            onChange={(e) =>
              setForm((p) => ({ ...p, is_premium: e.target.checked }))
            }
            className="rounded border-gray-600"
          />
          Premium
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdminShopClient() {
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<ListingFormState>(DEFAULT_FORM);
  const [createImages, setCreateImages] = useState<ImageItem[]>([]);

  const [editingListing, setEditingListing] = useState<ShopListing | null>(
    null
  );
  const [editForm, setEditForm] = useState<ListingFormState>(DEFAULT_FORM);
  const [editImages, setEditImages] = useState<ImageItem[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Table state
  const [sortKey, setSortKey] = useState<TableSortKey>("date");
  const [sortDir, setSortDir] = useState<TableSortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [busyRow, setBusyRow] = useState<string | null>(null);

  // Collapsed/expanded form sections
  const [createFormOpen, setCreateFormOpen] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/shop/listings", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Failed to load listings.");
      setListings(Array.isArray(data?.listings) ? data.listings : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const uploadPendingImages = async (
    listingId: string,
    images: ImageItem[]
  ) => {
    const urls: string[] = [];
    for (const image of images) {
      if (image.kind === "existing") {
        urls.push(image.url);
        continue;
      }
      const formData = new FormData();
      formData.append("file", image.file);
      formData.append("listingId", listingId);
      const response = await fetch("/api/admin/shop/images", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data?.url)
        throw new Error(data?.error || "Image upload failed.");
      urls.push(data.url);
    }
    return urls;
  };

  const patchListing = async (
    id: string,
    updates: Record<string, unknown>
  ) => {
    const response = await fetch("/api/admin/shop/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, updates }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Failed to update.");
    return data;
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const payload = formToPayload(createForm);
      const createResponse = await fetch("/api/admin/shop/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const createData = await createResponse.json();
      if (!createResponse.ok || !createData?.listing?.id)
        throw new Error(createData?.error || "Failed to create listing.");

      const listingId = createData.listing.id as string;
      const uploadedUrls = await uploadPendingImages(listingId, createImages);
      if (uploadedUrls.length > 0) {
        await patchListing(listingId, {
          image_urls: uploadedUrls,
          thumbnail_url: uploadedUrls[0],
        });
      }
      revokePendingUrls(createImages);
      setCreateImages([]);
      setCreateForm(DEFAULT_FORM);
      setCreateSuccess("Listing created.");
      setCreateFormOpen(false);
      await loadListings();
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create listing."
      );
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/admin/shop/sync", { method: "POST" });
      await loadListings();
    } finally {
      setSyncing(false);
    }
  };

  const openEditModal = (listing: ShopListing) => {
    revokePendingUrls(editImages);
    setEditingListing(listing);
    setEditForm(listingToForm(listing));
    setEditImages(toImageItemsFromUrls(listing.image_urls || []));
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingListing(null);
    setEditForm(DEFAULT_FORM);
    revokePendingUrls(editImages);
    setEditImages([]);
    setEditError(null);
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingListing) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const payload = formToPayload(editForm);
      await patchListing(editingListing.id, payload);
      const uploadedUrls = await uploadPendingImages(
        editingListing.id,
        editImages
      );
      await patchListing(editingListing.id, {
        image_urls: uploadedUrls,
        thumbnail_url: uploadedUrls[0] ?? null,
      });
      await loadListings();
      closeEditModal();
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "Failed to save."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteListing = async (id: string) => {
    try {
      setBusyRow(id);
      const response = await fetch(`/api/admin/shop/listings?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Failed to delete listing.");
      await loadListings();
      setDeleteConfirmId(null);
      if (editingListing?.id === id) closeEditModal();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Failed to delete listing."
      );
    } finally {
      setBusyRow(null);
    }
  };

  const runRowAction = async (
    listingId: string,
    updates: Record<string, unknown>
  ) => {
    try {
      setBusyRow(listingId);
      await patchListing(listingId, updates);
      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusyRow(null);
    }
  };

  const duplicateListing = async (listing: ShopListing) => {
    try {
      setBusyRow(listing.id);
      const response = await fetch("/api/admin/shop/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cloneListingForCreate(listing)),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Failed to duplicate.");
      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to duplicate.");
    } finally {
      setBusyRow(null);
    }
  };

  // Bulk actions
  const bulkUpdateStatus = async (status: ListingStatus) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const response = await fetch("/api/admin/shop/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          status,
        }),
      });
      if (!response.ok) throw new Error("Bulk update failed.");
      setSelectedIds(new Set());
      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Bulk update failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedListings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedListings.map((l) => l.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Sorting
  const toggleSort = (key: TableSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedListings = useMemo(() => {
    const list = [...listings];
    const dir = sortDir === "asc" ? 1 : -1;

    list.sort((a, b) => {
      switch (sortKey) {
        case "margin": {
          const mA = computeMargin(a.price, a.cost_basis) ?? -Infinity;
          const mB = computeMargin(b.price, b.cost_basis) ?? -Infinity;
          return (mA - mB) * dir;
        }
        case "price":
          return (a.price - b.price) * dir;
        case "cost_basis": {
          const cA = a.cost_basis ?? 0;
          const cB = b.cost_basis ?? 0;
          return (cA - cB) * dir;
        }
        case "status": {
          const statusOrder: Record<string, number> = {
            draft: 0,
            active: 1,
            delisted: 2,
            sold: 3,
          };
          return (
            ((statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4)) * dir
          );
        }
        case "date":
        default:
          return (
            (new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime()) *
            dir
          );
      }
    });

    return list;
  }, [listings, sortKey, sortDir]);

  // Summary stats
  const stats = useMemo(() => {
    const active = listings.filter((l) => l.status === "active");
    const draft = listings.filter((l) => l.status === "draft");
    const sold = listings.filter((l) => l.status === "sold");
    const totalValue = active.reduce(
      (sum, l) =>
        sum +
        Number(l.price) *
          Math.max(0, (l.quantity ?? 0) - (l.quantity_sold ?? 0)),
      0
    );
    const totalCost = listings
      .filter((l) => l.cost_basis != null && l.cost_basis > 0)
      .reduce((sum, l) => sum + Number(l.cost_basis!), 0);

    return {
      total: listings.length,
      active: active.length,
      draft: draft.length,
      sold: sold.length,
      totalValue,
      totalCost,
    };
  }, [listings]);

  const sortIndicator = (key: TableSortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ^" : " v";
  };

  return (
    <div className="space-y-6">
      {/* Summary stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total", value: String(stats.total) },
          { label: "Active", value: String(stats.active) },
          { label: "Draft", value: String(stats.draft) },
          { label: "Sold", value: String(stats.sold) },
          { label: "Inventory Value", value: formatUsd(stats.totalValue) },
          { label: "Total Cost", value: formatUsd(stats.totalCost) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-800 bg-gray-900/50 px-4 py-3"
          >
            <p className="text-[10px] uppercase tracking-wider text-gray-500">
              {stat.label}
            </p>
            <p className="text-lg font-semibold tabular-nums text-white">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Create listing section (collapsible) */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50">
        <button
          type="button"
          onClick={() => setCreateFormOpen((prev) => !prev)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <h2 className="text-xl font-semibold text-white">
              Create listing
            </h2>
            <p className="text-sm text-gray-400">
              Add cards with photos, pricing, cost basis, and publish status.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/shop"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-600 hover:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              View shop
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSync();
              }}
              disabled={syncing}
              className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-60"
            >
              {syncing ? "Syncing..." : "Sync from inventory"}
            </button>
            <span className="text-lg text-gray-500">
              {createFormOpen ? "-" : "+"}
            </span>
          </div>
        </button>

        {createFormOpen && (
          <div className="border-t border-gray-800 px-5 pb-5 pt-4">
            <form className="space-y-4" onSubmit={handleCreate}>
              <ListingFields form={createForm} setForm={setCreateForm} />

              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-200">Photos</h3>
                <ImageManager
                  images={createImages}
                  setImages={setCreateImages}
                  uploaderId="create-listing-images"
                />
              </div>

              {createError && (
                <p className="text-sm text-rose-400">{createError}</p>
              )}
              {createSuccess && (
                <p className="text-sm text-emerald-400">{createSuccess}</p>
              )}

              <button
                type="submit"
                disabled={createSubmitting}
                className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
              >
                {createSubmitting ? "Publishing..." : "Create listing"}
              </button>
            </form>
          </div>
        )}
      </section>

      {/* Listing Management Table */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">My listings</h2>
            <p className="text-sm text-gray-400">
              {stats.total} total &middot; {stats.active} active &middot;{" "}
              {stats.draft} draft &middot; {stats.sold} sold
            </p>
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => bulkUpdateStatus("active")}
                disabled={bulkBusy}
                className="rounded border border-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:border-emerald-600 disabled:opacity-50"
              >
                Activate
              </button>
              <button
                onClick={() => bulkUpdateStatus("sold")}
                disabled={bulkBusy}
                className="rounded border border-cyan-800 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:border-cyan-600 disabled:opacity-50"
              >
                Mark Sold
              </button>
              <button
                onClick={() => bulkUpdateStatus("delisted")}
                disabled={bulkBusy}
                className="rounded border border-amber-800 px-3 py-1.5 text-xs font-medium text-amber-300 hover:border-amber-600 disabled:opacity-50"
              >
                Delist
              </button>
              <button
                onClick={() => bulkUpdateStatus("draft")}
                disabled={bulkBusy}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:border-gray-500 disabled:opacity-50"
              >
                Draft
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Loading listings...</p>
        ) : listings.length === 0 ? (
          <p className="text-sm text-gray-400">No listings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="px-2 py-2 font-medium">
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.size === sortedListings.length &&
                        sortedListings.length > 0
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-gray-600"
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Thumb</th>
                  <th className="px-2 py-2 font-medium">Card</th>
                  <th className="px-2 py-2 font-medium">Grade</th>
                  <th
                    className="cursor-pointer px-2 py-2 font-medium hover:text-white"
                    onClick={() => toggleSort("cost_basis")}
                  >
                    Cost{sortIndicator("cost_basis")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-2 font-medium hover:text-white"
                    onClick={() => toggleSort("price")}
                  >
                    Shop Price{sortIndicator("price")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-2 font-medium hover:text-white"
                    onClick={() => toggleSort("margin")}
                  >
                    Margin{sortIndicator("margin")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-2 font-medium hover:text-white"
                    onClick={() => toggleSort("status")}
                  >
                    Status{sortIndicator("status")}
                  </th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th
                    className="cursor-pointer px-2 py-2 font-medium hover:text-white"
                    onClick={() => toggleSort("date")}
                  >
                    Date{sortIndicator("date")}
                  </th>
                  <th className="px-2 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {sortedListings.map((listing) => {
                  const margin = computeMargin(
                    listing.price,
                    listing.cost_basis
                  );
                  const available = Math.max(
                    0,
                    (listing.quantity ?? 0) - (listing.quantity_sold ?? 0)
                  );

                  return (
                    <tr
                      key={listing.id}
                      className={`transition-colors ${
                        selectedIds.has(listing.id)
                          ? "bg-cyan-950/20"
                          : "hover:bg-gray-800/30"
                      }`}
                    >
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(listing.id)}
                          onChange={() => toggleSelect(listing.id)}
                          className="rounded border-gray-600"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {listing.thumbnail_url || listing.image_urls?.[0] ? (
                          <img
                            src={
                              listing.thumbnail_url || listing.image_urls?.[0]
                            }
                            alt=""
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-800 text-[9px] text-gray-500">
                            No img
                          </div>
                        )}
                      </td>
                      <td className="max-w-[180px] px-2 py-2 text-white">
                        <div className="truncate font-medium">
                          {listing.player_name}
                        </div>
                        <div className="truncate text-xs text-gray-400">
                          {listing.year} {listing.set_brand}
                          {listing.parallel_variant
                            ? ` ${listing.parallel_variant}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-gray-200 whitespace-nowrap">
                        {listing.grade}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-amber-400 whitespace-nowrap">
                        {listing.cost_basis != null && listing.cost_basis > 0
                          ? formatUsd(listing.cost_basis)
                          : "--"}
                      </td>
                      <td className="px-2 py-2 tabular-nums text-white whitespace-nowrap font-medium">
                        {formatUsd(listing.price)}
                      </td>
                      <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                        {margin != null ? (
                          <span
                            className={`font-medium ${
                              margin >= 0
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            {margin >= 0 ? "+" : ""}
                            {margin.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-600">--</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            STATUS_COLORS[listing.status as ListingStatus] ??
                            STATUS_COLORS.draft
                          }`}
                        >
                          {listing.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 tabular-nums text-gray-300 text-center">
                        {available}/{listing.quantity ?? 0}
                      </td>
                      <td className="px-2 py-2 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(listing.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => openEditModal(listing)}
                            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-cyan-600 hover:text-cyan-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => duplicateListing(listing)}
                            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-gray-500"
                          >
                            Dup
                          </button>
                          {listing.status !== "active" && (
                            <button
                              onClick={() =>
                                runRowAction(listing.id, { status: "active" })
                              }
                              className="rounded border border-emerald-800 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600"
                            >
                              Activate
                            </button>
                          )}
                          {listing.status !== "sold" && (
                            <button
                              onClick={() =>
                                runRowAction(listing.id, { status: "sold" })
                              }
                              className="rounded border border-cyan-800 px-2 py-1 text-xs text-cyan-300 hover:border-cyan-600"
                            >
                              Sold
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteConfirmId(listing.id)}
                            className="rounded border border-rose-800 px-2 py-1 text-xs text-rose-300 hover:border-rose-600"
                          >
                            Del
                          </button>
                        </div>
                        {busyRow === listing.id && (
                          <div className="mt-1 text-[11px] text-gray-500">
                            Saving...
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirmId(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-950 p-6 text-center">
            <h3 className="text-lg font-semibold text-white">
              Delete listing?
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              This action cannot be undone.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteListing(deleteConfirmId)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingListing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditModal();
          }}
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-950 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                Edit listing: {editingListing.player_name}
              </h3>
              <button
                onClick={closeEditModal}
                className="rounded border border-gray-700 px-2 py-1 text-sm text-gray-300"
              >
                Close
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSaveEdit}>
              <ListingFields form={editForm} setForm={setEditForm} />

              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-200">Photos</h4>
                <ImageManager
                  images={editImages}
                  setImages={setEditImages}
                  uploaderId="edit-listing-images"
                />
              </div>

              {editError && (
                <p className="text-sm text-rose-400">{editError}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
                >
                  {savingEdit ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(editingListing.id)}
                  className="ml-auto rounded-lg border border-rose-800 px-4 py-2 text-sm text-rose-300"
                >
                  Delete listing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
