"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ShopListing, ShopOrder } from "@/types/shop";
import {
  SHOP_CATEGORY_OPTIONS,
  type ShopCategoryLabel,
} from "@/lib/cards/market-category";

type ListingStatus = "active" | "delisted" | "sold" | "archived";

type GradeOption =
  | "Raw"
  | "PSA 10"
  | "PSA 9"
  | "BGS 9.5"
  | "SGC 10"
  | "Other";

type ImageItem =
  | {
      id: string;
      kind: "existing";
      url: string;
    }
  | {
      id: string;
      kind: "pending";
      file: File;
      previewUrl: string;
    };

interface ListingFormState {
  player_name: string;
  year: string;
  set_brand: string;
  parallel_variant: string;
  card_number: string;
  grade_choice: GradeOption;
  grade_other: string;
  cert_number: string;
  sport: ShopCategoryLabel;
  price: string;
  cmv: string;
  shipping_cost: string;
  status: ListingStatus;
  featured: boolean;
  is_premium: boolean;
  accepts_offers: boolean;
  tags: string;
  notes: string;
  ebay_comp_url: string;
}

const GRADE_OPTIONS: GradeOption[] = [
  "Raw",
  "PSA 10",
  "PSA 9",
  "BGS 9.5",
  "SGC 10",
  "Other",
];

const SPORT_OPTIONS: ListingFormState["sport"][] = [...SHOP_CATEGORY_OPTIONS];

const STATUS_OPTIONS: ListingStatus[] = ["active", "delisted", "sold", "archived"];

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
  shipping_cost: "4.00",
  status: "active",
  featured: false,
  is_premium: false,
  accepts_offers: false,
  tags: "",
  notes: "",
  ebay_comp_url: "",
};

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
    return {
      grade_choice: directMatch,
      grade_other: "",
    };
  }

  return {
    grade_choice: "Other",
    grade_other: grade,
  };
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
    shipping_cost:
      listing.shipping_cost != null ? String(listing.shipping_cost) : "4.00",
    status: STATUS_OPTIONS.includes(listing.status as ListingStatus)
      ? (listing.status as ListingStatus)
      : "active",
    featured: Boolean(listing.featured),
    is_premium: Boolean(listing.is_premium),
    accepts_offers: Boolean(listing.accepts_offers),
    tags: Array.isArray(listing.tags) ? listing.tags.join(", ") : "",
    notes: listing.notes || "",
    ebay_comp_url: listing.ebay_comp_url || "",
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

  if (!form.player_name.trim()) {
    throw new Error("Player name is required.");
  }

  if (!Number.isFinite(year) || year <= 0) {
    throw new Error("Year is required.");
  }

  if (!form.set_brand.trim()) {
    throw new Error("Set/brand is required.");
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Price must be a valid number.");
  }

  if (!Number.isFinite(shippingCost) || shippingCost < 0) {
    throw new Error("Shipping cost must be 0 or greater.");
  }

  if (cmv != null && (!Number.isFinite(cmv) || cmv < 0)) {
    throw new Error("CMV must be empty or a valid number.");
  }

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
    shipping_cost: shippingCost,
    status: form.status,
    featured: form.featured,
    is_premium: form.is_premium,
    accepts_offers: form.accepts_offers,
    tags: parseTags(form.tags),
    notes: form.notes.trim() || null,
    ebay_comp_url: form.ebay_comp_url.trim() || null,
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
    shipping_cost: listing.shipping_cost,
    status: listing.status,
    featured: listing.featured,
    is_premium: listing.is_premium,
    accepts_offers: listing.accepts_offers,
    tags: listing.tags,
    notes: listing.notes,
    image_urls: listing.image_urls,
    thumbnail_url: listing.thumbnail_url,
    quantity: Math.max(1, (listing.quantity ?? 1) - (listing.quantity_sold ?? 0)),
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
      if (target?.kind === "pending") {
        URL.revokeObjectURL(target.previewUrl);
      }
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
            if (event.target.files) {
              addFiles(event.target.files);
            }
            event.target.value = "";
          }}
        />
        Drag & drop photos here, or click to upload
      </label>

      {images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => {
            const src = image.kind === "existing" ? image.url : image.previewUrl;

            return (
              <div
                key={image.id}
                className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900"
              >
                <div className="aspect-square bg-black/30">
                  <img src={src} alt="Listing preview" className="h-full w-full object-cover" />
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

function ListingFields({
  form,
  setForm,
}: {
  form: ListingFormState;
  setForm: React.Dispatch<React.SetStateAction<ListingFormState>>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Card / player name *</span>
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
          onChange={(event) =>
            setForm((previous) => ({ ...previous, year: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          required
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Set / brand *</span>
        <input
          value={form.set_brand}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, set_brand: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          required
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Parallel variant</span>
        <input
          value={form.parallel_variant}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, parallel_variant: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Card number</span>
        <input
          value={form.card_number}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, card_number: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        />
      </label>

      <div className="space-y-1 text-sm">
        <span className="text-gray-300">Grade *</span>
        <select
          value={form.grade_choice}
          onChange={(event) =>
            setForm((previous) => ({
              ...previous,
              grade_choice: event.target.value as GradeOption,
            }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
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
            onChange={(event) =>
              setForm((previous) => ({ ...previous, grade_other: event.target.value }))
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            placeholder="e.g. PSA 8"
          />
        </label>
      )}

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Cert number</span>
        <input
          value={form.cert_number}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, cert_number: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        />
      </label>

      <div className="space-y-1 text-sm">
        <span className="text-gray-300">Category / game *</span>
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

      <label className="space-y-1 text-sm">
        <span className="text-gray-300">Price *</span>
        <input
          type="number"
          step="0.01"
          value={form.price}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, price: event.target.value }))
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
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          required
        />
      </label>

      <div className="space-y-1 text-sm">
        <span className="text-gray-300">Status *</span>
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
        <span className="text-gray-300">Tags (comma-separated)</span>
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
        <span className="text-gray-300">Notes (private)</span>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, notes: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
        />
      </label>

      <label className="space-y-1 text-sm md:col-span-2">
        <span className="text-gray-300">eBay Comp URL</span>
        <input
          type="url"
          value={form.ebay_comp_url}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, ebay_comp_url: event.target.value }))
          }
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          placeholder="https://www.ebay.com/itm/..."
        />
        <span className="text-xs text-gray-500">Direct link to a sold eBay listing used as a pricing comp. Shown publicly as &ldquo;View eBay comp →&rdquo;.</span>
      </label>

      <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.featured}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, featured: event.target.checked }))
          }
          className="rounded border-gray-600"
        />
        Featured
      </label>

      <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.is_premium}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, is_premium: event.target.checked }))
          }
          className="rounded border-gray-600"
        />
        Premium
      </label>

      <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300 md:col-span-2">
        <input
          type="checkbox"
          checked={form.accepts_offers}
          onChange={(event) =>
            setForm((previous) => ({ ...previous, accepts_offers: event.target.checked }))
          }
          className="rounded border-gray-600"
        />
        Accept offers (shows in shop &ldquo;Offers only&rdquo; filter)
      </label>
    </div>
  );
}

export default function AdminShopClient() {
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<ListingFormState>(DEFAULT_FORM);
  const [createImages, setCreateImages] = useState<ImageItem[]>([]);

  const [editingListing, setEditingListing] = useState<ShopListing | null>(null);
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
        featured: boolean;
        accepts_offers: boolean;
      }
    >
  >({});

  const [busyRow, setBusyRow] = useState<string | null>(null);

  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/admin/shop/orders", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch (err) {
      console.error(err);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const cancelOrder = async (orderId: string) => {
    if (!confirm("Cancel this order and issue a full Stripe refund?")) return;
    setCancellingOrder(orderId);
    try {
      const res = await fetch("/api/admin/shop/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Cancel failed");
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel order");
    } finally {
      setCancellingOrder(null);
    }
  };

  const updateOrderFulfillment = async (orderId: string, fulfillment_status: string) => {
    try {
      const res = await fetch("/api/admin/shop/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, fulfillment_status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Update failed");
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update order");
    }
  };

  const loadListings = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/shop/listings", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
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
              featured: Boolean(listing.featured),
              accepts_offers: Boolean(listing.accepts_offers),
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
    loadOrders();
  }, [loadListings, loadOrders]);

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
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "Image upload failed.");
      }

      urls.push(data.url);
    }

    return urls;
  };

  const patchListing = async (id: string, updates: Record<string, unknown>) => {
    const response = await fetch("/api/admin/shop/listings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, updates }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Failed to update listing.");
    }

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
      if (!createResponse.ok || !createData?.listing?.id) {
        throw new Error(createData?.error || "Failed to create listing.");
      }

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
      setCreateSuccess("Listing created and published.");
      await loadListings();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create listing.");
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

      const uploadedUrls = await uploadPendingImages(editingListing.id, editImages);
      await patchListing(editingListing.id, {
        image_urls: uploadedUrls,
        thumbnail_url: uploadedUrls[0] ?? null,
      });

      await loadListings();
      closeEditModal();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to save listing.");
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
      featured: boolean;
      accepts_offers: boolean;
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
    field: "price" | "shipping_cost" | "status" | "featured"
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

      if (field === "featured" && Boolean(listing.featured) !== draft.featured) {
        await patchListing(listing.id, { featured: draft.featured });
      }

      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Inline update failed.");
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
      alert(error instanceof Error ? error.message : "Failed to update listing.");
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
      if (!response.ok) {
        throw new Error(data?.error || "Failed to duplicate listing.");
      }

      await loadListings();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to duplicate listing.");
    } finally {
      setBusyRow(null);
    }
  };

  const totalActive = useMemo(
    () => listings.filter((listing) => listing.status === "active").length,
    [listings]
  );

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Create listing</h2>
            <p className="text-sm text-gray-400">
              Add cards with photos, pricing, shipping, and publish status.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/shop"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-600 hover:text-white"
            >
              View shop
            </Link>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-60"
            >
              {syncing ? "Syncing..." : "Sync from inventory"}
            </button>
          </div>
        </div>

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

          {createError && <p className="text-sm text-rose-400">{createError}</p>}
          {createSuccess && <p className="text-sm text-emerald-400">{createSuccess}</p>}

          <button
            type="submit"
            disabled={createSubmitting}
            className="rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            {createSubmitting ? "Publishing..." : "Create listing"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-white">My listings</h2>
            <p className="text-sm text-gray-400">
              {listings.length} total - {totalActive} active
            </p>
          </div>
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
                  <th className="px-3 py-2 font-medium">Thumbnail</th>
                  <th className="px-3 py-2 font-medium">Card / Year / Set</th>
                  <th className="px-3 py-2 font-medium">Grade</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Shipping</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Featured</th>
                  <th className="px-3 py-2 font-medium">Offers</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {listings.map((listing) => {
                  const draft = inlineDrafts[listing.id];

                  return (
                    <tr key={listing.id}>
                      <td className="px-3 py-2">
                        {listing.thumbnail_url || listing.image_urls?.[0] ? (
                          <img
                            src={listing.thumbnail_url || listing.image_urls?.[0]}
                            alt=""
                            className="h-12 w-12 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-800 text-[10px] text-gray-500">
                            No image
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-white">
                        <div className="font-medium">{listing.player_name}</div>
                        <div className="text-xs text-gray-400">
                          {listing.year} - {listing.set_brand}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-200">{listing.grade}</td>
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
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={draft?.shipping_cost ?? ""}
                          onChange={(event) =>
                            updateInlineDraft(listing.id, {
                              shipping_cost: event.target.value,
                            })
                          }
                          onBlur={() => commitInline(listing, "shipping_cost")}
                          className="w-24 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={draft?.status ?? listing.status}
                          onChange={(event) => {
                            const status = event.target.value as ListingStatus;
                            updateInlineDraft(listing.id, { status });
                            void runRowAction(listing.id, { status });
                          }}
                          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={draft?.featured ?? Boolean(listing.featured)}
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
                      <td className="px-3 py-2">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={draft?.accepts_offers ?? Boolean(listing.accepts_offers)}
                            onChange={(event) => {
                              updateInlineDraft(listing.id, {
                                accepts_offers: event.target.checked,
                              });
                              void runRowAction(listing.id, {
                                accepts_offers: event.target.checked,
                              });
                            }}
                          />
                          Yes
                        </label>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">
                        {new Date(listing.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openEditModal(listing)}
                            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-gray-500"
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
                            onClick={() => runRowAction(listing.id, { status: "sold" })}
                            className="rounded border border-emerald-800 px-2 py-1 text-xs text-emerald-300 hover:border-emerald-600"
                          >
                            Mark sold
                          </button>
                          <button
                            onClick={() => runRowAction(listing.id, { status: "delisted" })}
                            className="rounded border border-amber-800 px-2 py-1 text-xs text-amber-300 hover:border-amber-600"
                          >
                            Delist
                          </button>
                          <button
                            onClick={() =>
                              runRowAction(listing.id, {
                                featured: !listing.featured,
                              })
                            }
                            className="rounded border border-cyan-800 px-2 py-1 text-xs text-cyan-300 hover:border-cyan-600"
                          >
                            {listing.featured ? "Unfeature" : "Feature"}
                          </button>
                          <button
                            onClick={() =>
                              runRowAction(listing.id, {
                                status: listing.status === "archived" ? "active" : "archived",
                              })
                            }
                            className="rounded border border-purple-800 px-2 py-1 text-xs text-purple-300 hover:border-purple-600"
                          >
                            {listing.status === "archived" ? "Unarchive" : "Archive"}
                          </button>
                        </div>
                        {busyRow === listing.id && (
                          <div className="mt-1 text-[11px] text-gray-500">Saving...</div>
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

      {/* Orders section */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-white">Orders</h2>
          <p className="text-sm text-gray-400">
            {orders.length} total — {orders.filter((o) => o.payment_status === "paid").length} paid,{" "}
            {orders.filter((o) => o.fulfillment_status === "unfulfilled" && o.payment_status === "paid").length} unfulfilled
          </p>
        </div>

        {ordersLoading ? (
          <p className="text-sm text-gray-400">Loading orders...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Buyer</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Payment</th>
                  <th className="px-3 py-2 font-medium">Fulfillment</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-white">{order.buyer_name}</div>
                      <div className="text-xs text-gray-400">{order.buyer_email}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-200">
                      ${Number(order.total ?? 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          order.payment_status === "paid"
                            ? "bg-emerald-900/50 text-emerald-300"
                            : order.payment_status === "cancelled"
                            ? "bg-rose-900/50 text-rose-300"
                            : order.payment_status === "refunded"
                            ? "bg-orange-900/50 text-orange-300"
                            : "bg-gray-800 text-gray-400"
                        }`}
                      >
                        {order.payment_status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {order.payment_status === "paid" ? (
                        <select
                          value={order.fulfillment_status}
                          onChange={(e) => updateOrderFulfillment(order.id, e.target.value)}
                          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-white"
                        >
                          <option value="unfulfilled">Unfulfilled</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            setExpandedOrder(expandedOrder === order.id ? null : order.id)
                          }
                          className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-gray-500"
                        >
                          {expandedOrder === order.id ? "Hide" : "Items"}
                        </button>
                        {order.payment_status === "paid" && (
                          <button
                            onClick={() => cancelOrder(order.id)}
                            disabled={cancellingOrder === order.id}
                            className="rounded border border-rose-800 px-2 py-1 text-xs text-rose-300 hover:border-rose-600 disabled:opacity-50"
                          >
                            {cancellingOrder === order.id ? "Cancelling…" : "Cancel & Refund"}
                          </button>
                        )}
                      </div>
                      {expandedOrder === order.id && (
                        <div className="mt-2 space-y-1 rounded bg-gray-800 p-2 text-xs text-gray-300">
                          {Array.isArray(order.items) && order.items.map((item, i) => (
                            <div key={i} className="flex justify-between gap-4">
                              <span>{item.player_name} {item.year} {item.set_brand} ({item.grade}) × {item.quantity}</span>
                              <span>${Number(item.price).toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="border-t border-gray-700 pt-1 flex justify-between font-medium">
                            <span>Subtotal</span>
                            <span>${Number(order.subtotal ?? 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-gray-400">
                            <span>Shipping</span>
                            <span>${Number(order.shipping_total ?? 0).toFixed(2)}</span>
                          </div>
                          {order.tracking_number && (
                            <div className="text-gray-400">
                              Tracking: {order.tracking_carrier ?? ""} {order.tracking_number}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingListing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeEditModal();
            }
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

              {editError && <p className="text-sm text-rose-400">{editError}</p>}

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
                  onClick={async () => {
                    if (!confirm("Delete this listing? This cannot be undone.")) {
                      return;
                    }

                    try {
                      setSavingEdit(true);
                      const response = await fetch(
                        `/api/admin/shop/listings?id=${editingListing.id}`,
                        {
                          method: "DELETE",
                        }
                      );

                      const data = await response.json();
                      if (!response.ok) {
                        throw new Error(data?.error || "Failed to delete listing.");
                      }

                      await loadListings();
                      closeEditModal();
                    } catch (error) {
                      setEditError(
                        error instanceof Error
                          ? error.message
                          : "Failed to delete listing."
                      );
                    } finally {
                      setSavingEdit(false);
                    }
                  }}
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
