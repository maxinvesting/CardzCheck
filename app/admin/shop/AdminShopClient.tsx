"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ShopListing } from "@/types/shop";

type ListingStatus = "active" | "delisted" | "sold" | "reserved";
type PublishState = "draft" | "published";
type ListingCondition = "raw" | "graded" | "sealed";
type ShippingMethod = "pwe" | "bmwt" | "box" | "pickup";
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
  title: string;
  inventory_item_id: string;
  player_name: string;
  year: string;
  set_brand: string;
  parallel_variant: string;
  card_number: string;
  grade_choice: GradeOption;
  grade_other: string;
  cert_number: string;
  condition: ListingCondition;
  sport: "Football" | "Basketball" | "Baseball" | "Other";
  price: string;
  quantity: string;
  cmv: string;
  shipping_method: ShippingMethod;
  shipping_cost: string;
  free_shipping: boolean;
  status: ListingStatus;
  publish_state: PublishState;
  featured: boolean;
  is_premium: boolean;
  tags: string;
  notes: string;
  description: string;
  quantity: string;
}

interface InventoryListItem {
  id: string;
  title: string | null;
  quantity: number | null;
  grade: string | null;
  condition_status: "raw" | "graded" | null;
  list_price_cents: number | null;
  current_market_value_cents: number | null;
  channel: string | null;
  status: string | null;
  cert_number: string | null;
  created_at: string;
}

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

const STATUS_OPTIONS: ListingStatus[] = ["active", "delisted", "reserved", "sold"];
const PUBLISH_STATE_OPTIONS: PublishState[] = ["draft", "published"];
const CONDITION_OPTIONS: ListingCondition[] = ["raw", "graded", "sealed"];
const SHIPPING_OPTIONS: ShippingMethod[] = ["pwe", "bmwt", "box", "pickup"];

const DEFAULT_FORM: ListingFormState = {
  title: "",
  inventory_item_id: "",
  player_name: "",
  year: "",
  set_brand: "",
  parallel_variant: "",
  card_number: "",
  grade_choice: "Raw",
  grade_other: "",
  cert_number: "",
  condition: "graded",
  sport: "Football",
  price: "",
  quantity: "1",
  cmv: "",
  shipping_method: "bmwt",
  shipping_cost: "4.00",
  free_shipping: false,
  status: "active",
  publish_state: "published",
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

function parseYearFromTitle(title: string | null | undefined): number | null {
  if (!title) return null;
  const match = title.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
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
  const shippingCost = listing.shipping_cost != null ? Number(listing.shipping_cost) : 4;
  const quantity = Math.max(1, listing.quantity ?? 1);

  return {
    title:
      listing.title ||
      [listing.player_name, listing.year, listing.set_brand, listing.parallel_variant]
        .filter(Boolean)
        .join(" "),
    inventory_item_id: listing.inventory_item_id || "",
    player_name: listing.player_name || "",
    year: listing.year ? String(listing.year) : "",
    set_brand: listing.set_brand || "",
    parallel_variant: listing.parallel_variant || "",
    card_number: listing.card_number || "",
    grade_choice: grade.grade_choice,
    grade_other: grade.grade_other,
    cert_number: listing.cert_number || "",
    condition: listing.condition ?? "graded",
    sport: SPORT_OPTIONS.includes(listing.sport as ListingFormState["sport"])
      ? (listing.sport as ListingFormState["sport"])
      : "Other",
    price: listing.price != null ? String(listing.price) : "",
    quantity: String(quantity),
    cmv: listing.cmv != null ? String(listing.cmv) : "",
    shipping_method: SHIPPING_OPTIONS.includes(
      listing.shipping_method as ShippingMethod
    )
      ? (listing.shipping_method as ShippingMethod)
      : "bmwt",
    shipping_cost: shippingCost.toFixed(2),
    free_shipping: shippingCost <= 0,
    status: STATUS_OPTIONS.includes(listing.status as ListingStatus)
      ? (listing.status as ListingStatus)
      : "active",
    publish_state: listing.publish_state ?? "published",
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
  const inferredYear = parseYearFromTitle(form.title);
  const year = Number(form.year || inferredYear || 0);
  const quantity = Number(form.quantity);
  const shippingCost = form.free_shipping ? 0 : Number(form.shipping_cost);
  const cmv = form.cmv.trim() ? Number(form.cmv) : null;
  const normalizedTitle = form.title.trim();

  if (!normalizedTitle && !form.player_name.trim()) {
    throw new Error("Title or player name is required.");
  }

  if (!Number.isFinite(year) || year <= 0) {
    throw new Error("Year is required (or include one in the title).");
  }

  if (!form.set_brand.trim() && !normalizedTitle) {
    throw new Error("Set/brand is required when title is empty.");
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Price must be a valid number.");
  }

  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error("Quantity must be at least 1.");
  }

  if (!Number.isFinite(shippingCost) || shippingCost < 0) {
    throw new Error("Shipping cost must be 0 or greater.");
  if (cmv != null && (!Number.isFinite(cmv) || cmv < 0))
    throw new Error("CMV must be empty or a valid number.");

  const grade =
    form.grade_choice === "Other"
      ? form.grade_other.trim() || "Raw"
      : form.grade_choice;

  const titleOrFallback = normalizedTitle || form.player_name.trim();

  return {
    title: titleOrFallback,
    inventory_item_id: form.inventory_item_id.trim() || null,
    player_name: form.player_name.trim() || titleOrFallback,
    year,
    set_brand: form.set_brand.trim() || titleOrFallback,
    parallel_variant: form.parallel_variant.trim() || null,
    card_number: form.card_number.trim() || null,
    grade: form.condition === "raw" ? "Raw" : grade,
    cert_number: form.cert_number.trim() || null,
    condition: form.condition,
    sport: form.sport,
    price,
    quantity: Math.trunc(quantity),
    cmv,
    shipping_method: form.shipping_method,
    shipping_cost: shippingCost,
    status: form.status,
    publish_state: form.publish_state,
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
    title: listing.title,
    inventory_item_id: listing.inventory_item_id,
    player_name: listing.player_name,
    year: listing.year,
    set_brand: listing.set_brand,
    parallel_variant: listing.parallel_variant,
    card_number: listing.card_number,
    grade: listing.grade,
    condition: listing.condition,
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
    publish_state: listing.publish_state,
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

function inventoryItemToFormPatch(item: InventoryListItem): Partial<ListingFormState> {
  const title = (item.title || "").trim();
  const year = parseYearFromTitle(title);
  const listPrice =
    item.list_price_cents != null && Number.isFinite(item.list_price_cents)
      ? (item.list_price_cents / 100).toFixed(2)
      : "";
  const cmv =
    item.current_market_value_cents != null &&
    Number.isFinite(item.current_market_value_cents)
      ? (item.current_market_value_cents / 100).toFixed(2)
      : "";
  const quantity =
    item.quantity != null && Number.isFinite(item.quantity)
      ? String(Math.max(1, Math.trunc(item.quantity)))
      : "1";

  return {
    title,
    inventory_item_id: item.id,
    player_name: title,
    year: year ? String(year) : "",
    set_brand: title,
    grade_choice: "Other",
    grade_other: (item.grade || "").trim(),
    cert_number: (item.cert_number || "").trim(),
    condition: item.condition_status === "raw" ? "raw" : "graded",
    price: listPrice,
    quantity,
    cmv,
    status: "active",
    publish_state: "draft",
    tags: item.channel ? item.channel : "",
  };
}

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
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm md:col-span-2">
        <span className="text-gray-300">Listing title *</span>
        <input
          value={form.title}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, title: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          placeholder="e.g. 2024 Topps Chrome C.J. Stroud PSA 10"
          required
        />
      </label>

      {form.inventory_item_id && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300 md:col-span-2">
          Linked inventory item: <span className="font-mono">{form.inventory_item_id}</span>
        </div>
      )}

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Player name / entity *</span>
        <input
          value={form.player_name}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, player_name: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
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

      <div className="space-y-1 text-sm">
        <span className="text-gray-300">Condition *</span>
        <select
          value={form.condition}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              condition: event.target.value as ListingCondition,
            }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        >
          {CONDITION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1 text-sm">
        <span className="text-gray-300">Sport *</span>
        <select
          value={form.sport}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              sport: event.target.value as ListingFormState["sport"],
            }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        >
          {SPORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
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

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Quantity *</span>
        <input
          type="number"
          min="1"
          step="1"
          value={form.quantity}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, quantity: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          required
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">CMV</span>
        <input
          type="number"
          step="0.01"
          value={form.cmv}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, cmv: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        />
      </label>

      <div className="space-y-1 text-sm">
        <span className="text-gray-300">Shipping method *</span>
        <select
          value={form.shipping_method}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              shipping_method: event.target.value as ShippingMethod,
            }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        >
          {SHIPPING_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Shipping cost *</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={form.shipping_cost}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, shipping_cost: event.target.value }))
          }
          disabled={form.free_shipping}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          required
        />
      </label>

      <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.free_shipping}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              free_shipping: event.target.checked,
              shipping_cost: event.target.checked ? "0.00" : previous.shipping_cost,
            }))
          }
          className="rounded border-gray-600"
        />
        Free shipping
      </label>

      <div className="space-y-1 text-sm">
        <span className="text-gray-300">Publish state *</span>
        <select
          value={form.publish_state}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              publish_state: event.target.value as PublishState,
            }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        >
          {PUBLISH_STATE_OPTIONS.map((publishState) => (
            <option key={publishState} value={publishState}>
              {publishState}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1 text-sm">
        <span className="text-gray-300">Lifecycle status *</span>
        <select
          value={form.status}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              status: event.target.value as ListingStatus,
            }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <label className="space-y-1 text-sm md:col-span-2">
        <span className="text-gray-300">Channel tags (optional, comma-separated)</span>
        <input
          value={form.tags}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, tags: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
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
  const searchParams = useSearchParams();
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<ListingFormState>(DEFAULT_FORM);
  const [createImages, setCreateImages] = useState<ImageItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryListItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [queryPrefillApplied, setQueryPrefillApplied] = useState(false);

  const [editingListing, setEditingListing] = useState<ShopListing | null>(
    null
  );
  const [editForm, setEditForm] = useState<ListingFormState>(DEFAULT_FORM);
  const [editImages, setEditImages] = useState<ImageItem[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [inlineDrafts, setInlineDrafts] = useState<
    Record<
      string,
      {
        price: string;
        shipping_cost: string;
        status: ListingStatus;
        publish_state: PublishState;
        featured: boolean;
      }
    >
  >({});

  const [busyRow, setBusyRow] = useState<string | null>(null);

  const filteredInventoryItems = useMemo(() => {
    const query = inventoryQuery.trim().toLowerCase();
    if (!query) return inventoryItems;
    return inventoryItems.filter((item) =>
      (item.title || "").toLowerCase().includes(query)
    );
  }, [inventoryItems, inventoryQuery]);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/shop/listings", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "Failed to load listings.");
      }

      const nextListings = Array.isArray(data?.listings) ? data.listings : [];
      setListings(nextListings);
      setInlineDrafts(
        Object.fromEntries(
          nextListings.map((listing: ShopListing) => [
            listing.id,
            {
              price: Number(listing.price).toFixed(2),
              shipping_cost: Number(listing.shipping_cost ?? 0).toFixed(2),
              status: STATUS_OPTIONS.includes(listing.status as ListingStatus)
                ? (listing.status as ListingStatus)
                : "active",
              publish_state: listing.publish_state ?? "published",
              featured: Boolean(listing.featured),
            },
          ])
        )
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const loadInventoryItems = useCallback(async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const response = await fetch("/api/admin/shop/inventory?limit=200", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to load inventory items.");
      }
      setInventoryItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      setInventoryError(
        error instanceof Error ? error.message : "Failed to load inventory items."
      );
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventoryItems();
  }, [loadInventoryItems]);

  const applyInventoryPrefill = useCallback((item: InventoryListItem) => {
    const patch = inventoryItemToFormPatch(item);
    setCreateForm((previous) => ({
      ...previous,
      ...patch,
    }));
    setCreateError(null);
    setCreateSuccess(`Prefilled from inventory item: ${item.title || item.id}`);
  }, []);

  useEffect(() => {
    if (queryPrefillApplied) return;
    const inventoryItemId = searchParams.get("inventory_item_id");
    if (!inventoryItemId || inventoryItems.length === 0) return;

    const item = inventoryItems.find((candidate) => candidate.id === inventoryItemId);
    if (!item) return;

    setSelectedInventoryId(item.id);
    applyInventoryPrefill(item);
    setQueryPrefillApplied(true);
  }, [
    applyInventoryPrefill,
    inventoryItems,
    queryPrefillApplied,
    searchParams,
  ]);

  const uploadPendingImages = async (listingId: string, images: ImageItem[]) => {
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

  const createListing = async (publishState: PublishState) => {
    setCreateSubmitting(true);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      const payload = formToPayload({
        ...createForm,
        publish_state: publishState,
      });

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
      setSelectedInventoryId("");
      setCreateSuccess(
        publishState === "published"
          ? "Listing published to marketplace."
          : "Listing saved as draft."
      );
      await loadListings();
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create listing."
      );
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    await createListing(createForm.publish_state);
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

  const updateInlineDraft = (
    listingId: string,
    patch: Partial<{
      price: string;
      shipping_cost: string;
      status: ListingStatus;
      publish_state: PublishState;
      featured: boolean;
    }>
  ) => {
    setInlineDrafts((previous) => ({
      ...previous,
      [listingId]: {
        ...previous[listingId],
        ...patch,
      },
    }));
  };

  const commitInline = async (
    listing: ShopListing,
    field: "price" | "shipping_cost" | "status" | "publish_state" | "featured"
  ) => {
    const draft = inlineDrafts[listing.id];
    if (!draft) return;

    try {
      setBusyRow(listing.id);

      if (field === "price") {
        const next = Number(draft.price);
        if (!Number.isFinite(next) || next < 0) {
          throw new Error("Price must be a valid number.");
        }
        if (Number(listing.price) !== next) {
          await patchListing(listing.id, { price: next });
        }
      }

      if (field === "shipping_cost") {
        const next = Number(draft.shipping_cost);
        if (!Number.isFinite(next) || next < 0) {
          throw new Error("Shipping cost must be 0 or greater.");
        }
        if (Number(listing.shipping_cost ?? 0) !== next) {
          await patchListing(listing.id, { shipping_cost: next });
        }
      }

      if (field === "status" && listing.status !== draft.status) {
        await patchListing(listing.id, { status: draft.status });
      }

      if (
        field === "publish_state" &&
        (listing.publish_state ?? "published") !== draft.publish_state
      ) {
        await patchListing(listing.id, { publish_state: draft.publish_state });
      }

      if (field === "featured" && Boolean(listing.featured) !== draft.featured) {
        await patchListing(listing.id, { featured: draft.featured });
      }

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

  const totalPublishedActive = useMemo(
    () =>
      listings.filter(
        (listing) =>
          listing.status === "active" &&
          (listing.publish_state ?? "published") === "published"
      ).length,
    [listings]
  );

  const totalDraft = useMemo(
    () =>
      listings.filter(
        (listing) => (listing.publish_state ?? "published") === "draft"
      ).length,
    [listings]
  );

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
            <h2 className="text-xl font-semibold text-white">Create marketplace listing</h2>
            <p className="text-sm text-gray-400">
              Add listings from inventory or manual entry with photos, condition, shipping, and publish controls.
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
              View marketplace
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

        <form className="space-y-4" onSubmit={handleCreate}>
          <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-gray-200">Prefill from inventory</h3>
              <button
                type="button"
                onClick={loadInventoryItems}
                disabled={inventoryLoading}
                className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-gray-600 disabled:opacity-60"
              >
                {inventoryLoading ? "Refreshing..." : "Refresh inventory"}
              </button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input
                value={inventoryQuery}
                onChange={(event) => setInventoryQuery(event.target.value)}
                placeholder="Search inventory title"
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              />
              <select
                value={selectedInventoryId}
                onChange={(event) => setSelectedInventoryId(event.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
              >
                <option value="">Select inventory item</option>
                {filteredInventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {(item.title || "Untitled")} · Qty {item.quantity ?? 0} · {item.status || "unknown"}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const item = inventoryItems.find(
                    (candidate) => candidate.id === selectedInventoryId
                  );
                  if (!item) return;
                  applyInventoryPrefill(item);
                }}
                disabled={!selectedInventoryId}
                className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-60"
              >
                Use item
              </button>
            </div>

            {inventoryError && (
              <p className="mt-2 text-xs text-rose-400">{inventoryError}</p>
            )}
          </div>

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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={createSubmitting}
              onClick={() => void createListing("draft")}
              className="rounded-lg border border-gray-600 px-5 py-2.5 text-sm font-medium text-gray-100 hover:border-gray-500 disabled:opacity-60"
            >
              {createSubmitting ? "Submitting..." : "Save draft"}
            </button>
            <button
              type="button"
              disabled={createSubmitting}
              onClick={() => void createListing("published")}
              className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
            >
              {createSubmitting ? "Publishing..." : "Publish to marketplace"}
            </button>
          </div>
        </form>
      </section>

      {/* Listing Management Table */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Marketplace listings</h2>
            <p className="text-sm text-gray-400">
              {listings.length} total • {totalPublishedActive} live • {totalDraft} draft
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
          <p className="text-sm text-gray-400">No marketplace listings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="px-3 py-2 font-medium">Thumbnail</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Condition / Grade</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Shipping</th>
                  <th className="px-3 py-2 font-medium">Lifecycle</th>
                  <th className="px-3 py-2 font-medium">Visibility</th>
                  <th className="px-3 py-2 font-medium">Featured</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
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
                      <td className="px-3 py-2 text-white">
                        <div className="font-medium">{listing.title || listing.player_name}</div>
                        <div className="text-xs text-gray-400">
                          {listing.year} • {listing.set_brand}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-200">
                        <div className="capitalize">{listing.condition || "graded"}</div>
                        <div className="text-xs text-gray-400">{listing.grade}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={draft?.price ?? ""}
                          onChange={(event) =>
                            updateInlineDraft(listing.id, { price: event.target.value })
                          }
                          onBlur={() => commitInline(listing, "price")}
                          className="w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
                        />
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
                      <td className="px-3 py-2">
                        <select
                          value={draft?.publish_state ?? listing.publish_state ?? "published"}
                          onChange={(event) => {
                            const publishState = event.target.value as PublishState;
                            updateInlineDraft(listing.id, { publish_state: publishState });
                            void runRowAction(listing.id, {
                              publish_state: publishState,
                            });
                          }}
                          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
                        >
                          {PUBLISH_STATE_OPTIONS.map((publishState) => (
                            <option key={publishState} value={publishState}>
                              {publishState}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={draft?.featured ?? false}
                            onChange={(event) => {
                              updateInlineDraft(listing.id, {
                                featured: event.target.checked,
                              });
                              void runRowAction(listing.id, {
                                featured: event.target.checked,
                              });
                            }}
                          />
                          Yes
                        </label>
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
                            Duplicate
                          </button>
                          <button
                            onClick={() =>
                              runRowAction(listing.id, {
                                publish_state:
                                  (listing.publish_state ?? "published") === "published"
                                    ? "draft"
                                    : "published",
                              })
                            }
                            className="rounded border border-indigo-800 px-2 py-1 text-xs text-indigo-300 hover:border-indigo-600"
                          >
                            {(listing.publish_state ?? "published") === "published"
                              ? "Move to draft"
                              : "Publish"}
                          </button>
                          <button
                            onClick={() => runRowAction(listing.id, { status: "sold" })}
                            className="rounded border border-emerald-800 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600"
                          >
                            Mark sold
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
                Edit listing: {editingListing.title || editingListing.player_name}
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
