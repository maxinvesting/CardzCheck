"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ShopListing } from "@/types/shop";

export default function AdminShopClient() {
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    flagged: string[];
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ShopListing>>({});
  const [saving, setSaving] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shop/listings", { cache: "no-store" });
      const data = await res.json();
      if (data.listings) {
        setListings(data.listings);
      }
    } catch (err) {
      console.error("Failed to load listings", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/shop/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(data);
        await loadListings();
      } else {
        setSyncResult({ created: 0, updated: 0, skipped: 0, flagged: [data.error] });
      }
    } catch (err) {
      setSyncResult({
        created: 0,
        updated: 0,
        skipped: 0,
        flagged: [String(err)],
      });
    } finally {
      setSyncing(false);
    }
  };

  const startEdit = (listing: ShopListing) => {
    setEditingId(listing.id);
    setEditValues({
      price: listing.price,
      status: listing.status,
      featured: listing.featured,
      shipping_method: listing.shipping_method,
      shipping_cost: listing.shipping_cost,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/shop/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, updates: editValues }),
      });
      if (res.ok) {
        await loadListings();
        cancelEdit();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (listingId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("listingId", listingId);
    const res = await fetch("/api/admin/shop/images", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (res.ok && data.url) {
      const listing = listings.find((l) => l.id === listingId);
      if (listing) {
        const urls = [...(listing.image_urls ?? []), data.url];
        await fetch("/api/admin/shop/listings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: listingId,
            updates: {
              image_urls: urls,
              thumbnail_url: urls[0] ?? null,
            },
          }),
        });
        await loadListings();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/shop"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium"
        >
          View Shop
        </Link>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 text-white font-medium disabled:opacity-50"
        >
          {syncing ? "Syncing..." : "Sync from Inventory"}
        </button>
      </div>

      {syncResult && (
        <div className="p-4 rounded-lg bg-gray-900 border border-gray-800">
          <p className="text-sm text-gray-300">
            Created: {syncResult.created}, Updated: {syncResult.updated},
            Skipped: {syncResult.skipped}
          </p>
          {syncResult.flagged.length > 0 && (
            <p className="mt-2 text-sm text-amber-400">
              Flagged: {syncResult.flagged.join(", ")}
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading listings...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-left">
              <tr>
                <th className="px-4 py-3 text-gray-400 font-medium">Image</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Player</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Price</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Featured</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Shipping</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Stock</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {listings.map((listing) => (
                <tr key={listing.id} className="bg-gray-900/50 hover:bg-gray-900">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {listing.thumbnail_url || listing.image_urls?.[0] ? (
                        <img
                          src={listing.thumbnail_url || listing.image_urls?.[0]}
                          alt=""
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs">
                          No img
                        </div>
                      )}
                      <label className="cursor-pointer text-cyan-400 hover:text-cyan-300 text-xs">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleImageUpload(listing.id, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white">
                    {listing.player_name} {listing.year} {listing.set_brand}{" "}
                    {listing.grade}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === listing.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editValues.price ?? ""}
                        onChange={(e) =>
                          setEditValues((p) => ({
                            ...p,
                            price: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-20 px-2 py-1 rounded bg-gray-800 text-white border border-gray-700"
                      />
                    ) : (
                      <span className="text-cyan-400">
                        ${Number(listing.price).toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === listing.id ? (
                      <select
                        value={editValues.status ?? ""}
                        onChange={(e) =>
                          setEditValues((p) => ({
                            ...p,
                            status: e.target.value as ShopListing["status"],
                          }))
                        }
                        className="px-2 py-1 rounded bg-gray-800 text-white border border-gray-700"
                      >
                        <option value="active">active</option>
                        <option value="sold">sold</option>
                        <option value="reserved">reserved</option>
                        <option value="delisted">delisted</option>
                      </select>
                    ) : (
                      <span>{listing.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === listing.id ? (
                      <input
                        type="checkbox"
                        checked={editValues.featured ?? false}
                        onChange={(e) =>
                          setEditValues((p) => ({
                            ...p,
                            featured: e.target.checked,
                          }))
                        }
                        className="rounded"
                      />
                    ) : listing.featured ? (
                      <span className="text-cyan-400">Yes</span>
                    ) : (
                      <span className="text-gray-500">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === listing.id ? (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          placeholder="bmwt"
                          value={editValues.shipping_method ?? ""}
                          onChange={(e) =>
                            setEditValues((p) => ({
                              ...p,
                              shipping_method: e.target.value,
                            }))
                          }
                          className="w-16 px-2 py-1 rounded bg-gray-800 text-white border border-gray-700"
                        />
                        <input
                          type="number"
                          step="0.01"
                          placeholder="4"
                          value={editValues.shipping_cost ?? ""}
                          onChange={(e) =>
                            setEditValues((p) => ({
                              ...p,
                              shipping_cost: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="w-14 px-2 py-1 rounded bg-gray-800 text-white border border-gray-700"
                        />
                      </div>
                    ) : (
                      <span>
                        {listing.shipping_method} $
                        {Number(listing.shipping_cost).toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {listing.quantity_sold ?? 0} / {listing.quantity}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === listing.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-700 text-white text-xs disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(listing)}
                        className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && listings.length === 0 && (
        <p className="text-gray-400">No listings yet. Run Sync from Inventory.</p>
      )}
    </div>
  );
}
