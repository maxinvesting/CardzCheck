"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CollectionItem, CardImage } from "@/types";
import CardImageGallery from "@/components/CardImageGallery";
import CardDetailsForm from "@/components/CardDetailsForm";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import GradeEstimateProgressPanel from "@/components/grading/GradeEstimateProgressPanel";
import { createClient } from "@/lib/supabase/client";
import { hasBusinessWorkspaceAccess } from "@/lib/business/workspace-access";
import { useGradeEstimateFromImages } from "@/lib/grading/useGradeEstimateFromImages";
import { gradingCopy } from "@/copy/grading";
import CompsAndCmvSection from "@/components/comps/CompsAndCmvSection";
import CompsMarketplaces from "@/components/comps/CompsMarketplaces";
import { formatCurrency, formatPct, computeGainLoss } from "@/lib/formatters";
import { getEstCmv } from "@/lib/values";

// ── Surface card style (shared) ──────────────────────────────────────────────
const surface: React.CSSProperties = {
  background: "var(--color-background-primary)",
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: "var(--border-radius-lg)",
};

// ── Small all-caps muted label ────────────────────────────────────────────────
function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: "var(--color-text-subtle)",
        fontWeight: 500,
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

export default function CardProfilePage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;

  const [card, setCard] = useState<CollectionItem | null>(null);
  const [images, setImages] = useState<CardImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBusinessUser, setIsBusinessUser] = useState(false);
  const [promotingToInventory, setPromotingToInventory] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"Details" | "Shop" | "Comps">("Details");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    fetchCard();
    loadAccess();
  }, [cardId]);

  const loadAccess = async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setIsBusinessUser(await hasBusinessWorkspaceAccess(supabase as any, user.id));
    } catch {
      setIsBusinessUser(false);
    }
  };

  const fetchCard = async () => {
    try {
      const response = await fetch(`/api/cards/${cardId}`);

      if (!response.ok) {
        if (response.status === 404) {
          const businessProfileResponse = await fetch(
            `/api/card-profile/${cardId}?from=business`,
            { cache: "no-store" }
          );
          if (businessProfileResponse.ok) {
            const businessProfile = await businessProfileResponse.json().catch(() => null);
            const businessItemId =
              typeof businessProfile?.item?.id === "string" && businessProfile.item.id.length > 0
                ? businessProfile.item.id
                : cardId;
            router.replace(`/business/card/${businessItemId}`);
            return;
          }

          const collectionProfileResponse = await fetch(
            `/api/card-profile/${cardId}?from=collection`,
            { cache: "no-store" }
          );
          if (collectionProfileResponse.ok) {
            const collectionProfile = await collectionProfileResponse.json().catch(() => null);
            const collectionItemId =
              typeof collectionProfile?.item?.id === "string" && collectionProfile.item.id.length > 0
                ? collectionProfile.item.id
                : cardId;
            router.replace(`/card/${collectionItemId}?from=collection`);
            return;
          }

          router.replace(`/business/card/${cardId}`);
          return;
        } else if (response.status === 401) {
          router.push("/signin");
          return;
        } else {
          setError("Failed to load card");
        }
        return;
      }

      const data = await response.json();
      setCard(data.card);
      setImages(data.card.card_images || []);
    } catch (err) {
      console.error("Error fetching card:", err);
      setError("Failed to load card");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCard = (updates: Partial<CollectionItem>) => {
    if (!card) return;
    setCard({ ...card, ...updates });
  };

  const handleSaveCard = async () => {
    if (!card) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_name: card.player_name,
          players: card.players,
          year: card.year,
          set_name: card.set_name,
          insert: card.insert,
          grade: card.grade,
          grading_company: card.grading_company,
          cert_number: card.cert_number,
          psa_cert_number: card.psa_cert_number ?? card.cert_number,
          acquisition_type: card.acquisition_type,
          purchase_price: card.purchase_price,
          purchase_date: card.purchase_date,
          notes: card.notes,
        }),
      });

      if (!response.ok) throw new Error("Failed to save card");

      const data = await response.json();
      setCard(data.card);
    } catch (err) {
      console.error("Error saving card:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePromoteToInventory = async () => {
    if (!card || promotingToInventory) return;
    setPromotingToInventory(true);
    try {
      const response = await fetch("/api/collection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: card.id,
          item_kind: "inventory",
          title: card.title || [card.year, card.player_name, card.set_name, card.grade].filter(Boolean).join(" "),
          quantity: card.quantity ?? 1,
          status: card.status || "unlisted",
          channel: card.channel || "other",
          condition_status: card.condition_status || (card.grade ? "graded" : "raw"),
        }),
      });

      if (!response.ok) throw new Error("Failed to add card to inventory");

      const data = await response.json();
      if (data?.item) setCard(data.item);
    } catch (err) {
      console.error("Error promoting card to inventory:", err);
      alert("Failed to add to inventory. Please try again.");
    } finally {
      setPromotingToInventory(false);
    }
  };

  const imageUrls = useMemo(() => {
    const fromImages = (images || []).map((img) => img.url).filter((u): u is string => Boolean(u));
    if (fromImages.length > 0) return fromImages;
    if (!card) return [];
    return card.trusted_image?.frontCandidates ?? [];
  }, [images, card]);

  const cardIdentity = useMemo(() => {
    if (!card) return null;
    const c = card as CollectionItem & { variation?: string | null };
    const asOptional = (value: string | null | undefined) => value ?? undefined;
    return {
      player_name: card.player_name ?? "",
      year: asOptional(card.year),
      set_name: asOptional(card.set_name),
      card_number: asOptional(card.card_number),
      parallel_type: asOptional(card.parallel_type),
      variation: asOptional(c.variation),
      insert: asOptional(card.insert),
    };
  }, [card]);

  const gradeEstimate = useGradeEstimateFromImages({ imageUrls, card: cardIdentity });

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-page, #F3F0EB)" }}>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <svg className="animate-spin h-8 w-8 mx-auto mb-4" style={{ color: "#1D9E75" }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>Loading card...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !card) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-page, #F3F0EB)" }}>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div style={{ ...surface, padding: "32px", textAlign: "center" }}>
            <svg className="w-16 h-16 mx-auto mb-4" style={{ color: "#ef4444" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>
              {error || "Card not found"}
            </h2>
            <button
              onClick={() => router.push(isBusinessUser ? "/business" : "/collection")}
              style={{ marginTop: 16, padding: "8px 20px", background: "#1D9E75", color: "white", border: "none", borderRadius: 8, fontWeight: 500, cursor: "pointer" }}
            >
              Back to Inventory
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const cmv = getEstCmv(card);
  const gainLoss = computeGainLoss(cmv, card.purchase_price);
  const primaryImage = imageUrls[0] ?? null;
  const certNumber = card.cert_number || card.psa_cert_number;
  const gradingCo = card.grading_company || (certNumber ? "PSA" : null);
  const certUrl =
    gradingCo?.toLowerCase() === "psa" && certNumber
      ? `https://www.psacard.com/cert/${certNumber}`
      : null;

  const handleFindComps = () => {
    const p = new URLSearchParams();
    p.set("player", card.player_name);
    if (card.year) p.set("year", card.year);
    if (card.set_name) p.set("set", card.set_name);
    if (card.grade) p.set("grade", card.grade);
    p.set("card_id", card.id);
    router.push(`/comps?${p.toString()}`);
  };

  const acquiredLabel = card.purchase_date
    ? new Date(card.purchase_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const sourceLabel = card.acquisition_type
    ? card.acquisition_type.charAt(0).toUpperCase() + card.acquisition_type.slice(1)
    : "Other";

  const statusLabel = card.status ? card.status.replace(/_/g, " ") : "Unlisted";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-page, #F3F0EB)" }}>
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => router.push(isBusinessUser ? "/business" : "/collection")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            color: "var(--color-text-muted)", fontSize: 13,
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Inventory
        </button>

        {isBusinessUser && card.item_kind !== "inventory" && (
          <button
            onClick={handlePromoteToInventory}
            disabled={promotingToInventory}
            style={{
              marginLeft: "auto",
              padding: "6px 14px",
              background: "#1D9E75", color: "white",
              border: "none", borderRadius: 6,
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              opacity: promotingToInventory ? 0.6 : 1,
            }}
          >
            {promotingToInventory ? "Adding..." : "Add to Inventory"}
          </button>
        )}
      </div>

      {/* ── Edit slide-over ───────────────────────────────────────────────── */}
      {isEditing && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
          <div
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }}
            onClick={() => setIsEditing(false)}
          />
          <div
            style={{
              position: "relative", width: "min(520px, 100%)", height: "100%",
              background: "#fff", overflowY: "auto",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
              display: "flex", flexDirection: "column", gap: 0,
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 500, fontSize: 15, color: "#0f172a" }}>Edit card</span>
              <button
                onClick={() => setIsEditing(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 20, lineHeight: 1, padding: "0 2px" }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Image gallery in edit panel */}
            <div style={{ padding: "16px 20px", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", fontWeight: 500, marginBottom: 10 }}>Photos</p>
              <CardImageGallery cardId={cardId} images={images} onImagesChange={setImages} />
            </div>

            <div style={{ padding: "16px 20px" }}>
              <CardDetailsForm
                card={card}
                onUpdate={handleUpdateCard}
                onSave={handleSaveCard}
                saving={saving}
                defaultEditing
                onExitEdit={() => setIsEditing(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Two-column grid ───────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[280px_1fr]"
        style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 48px", gap: 20, alignItems: "start" }}
      >
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Slab image card */}
          <div style={{ ...surface, overflow: "hidden" }}>
            <div
              style={{
                aspectRatio: "3/4",
                background: "#f5f2ee",
                overflow: "hidden",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {primaryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={primaryImage}
                  alt={card.player_name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: 80, height: 80, border: "2px dashed rgba(0,0,0,0.15)",
                      borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 10px",
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>No image available</span>
                </div>
              )}
            </div>

            {/* Cert footer */}
            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px",
                borderTop: "0.5px solid var(--color-border-tertiary)",
              }}
            >
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", fontWeight: 500 }}>
                {gradingCo || "PSA"} CERT
              </span>
              {certNumber ? (
                certUrl ? (
                  <a
                    href={certUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#1D9E75", fontSize: 13, fontWeight: 500, textDecoration: "none" }}
                  >
                    {certNumber}
                  </a>
                ) : (
                  <span style={{ color: "#1D9E75", fontSize: 13, fontWeight: 500 }}>{certNumber}</span>
                )
              ) : (
                <span style={{ color: "#94a3b8", fontSize: 13 }}>—</span>
              )}
            </div>
          </div>

          {/* 2×2 quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Grade", value: card.grade || "—" },
              { label: "Qty", value: String(card.quantity ?? 1) },
              { label: "Acquired", value: acquiredLabel },
              { label: "Source", value: sourceLabel },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{ ...surface, padding: "10px 12px" }}
              >
                <StatLabel>{stat.label}</StatLabel>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Header block */}
          <div style={{ ...surface, padding: "22px 24px" }}>
            {/* Meta line */}
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.09em", color: "#94a3b8", fontWeight: 500, marginBottom: 6 }}>
              Sports card{card.set_name ? ` · ${card.year ? card.year + " " : ""}${card.set_name}` : ""}
            </div>

            {/* Title: player on line 1, parallel/insert on line 2 */}
            <h1 style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.3, color: "var(--color-text-primary)", margin: "0 0 12px" }}>
              {card.player_name}
              {(card.parallel_type || card.insert) && (
                <>
                  <br />
                  <span style={{ fontWeight: 400, color: "#475569" }}>
                    {card.parallel_type || card.insert}
                  </span>
                </>
              )}
            </h1>

            {/* Grade pill */}
            {card.grade && (
              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 12px", borderRadius: 999,
                  background: "#E1F5EE", color: "#0F6E56",
                  fontSize: 12, fontWeight: 500, marginBottom: 20,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1D9E75", flexShrink: 0 }} />
                {card.grade} · Graded
              </div>
            )}

            {/* Price row */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
              <div style={{ fontSize: 36, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {cmv ? formatCurrency(cmv) : "—"}
              </div>
              {gainLoss && (
                <div
                  style={{
                    padding: "5px 12px", borderRadius: 6,
                    background: gainLoss.amount >= 0 ? "#E1F5EE" : "#FEE2E2",
                    color: gainLoss.amount >= 0 ? "#0F6E56" : "#DC2626",
                    fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
                  }}
                >
                  {gainLoss.amount >= 0 ? "+" : ""}{formatCurrency(gainLoss.amount)} · {formatPct(gainLoss.pct)} ROI
                </div>
              )}
            </div>

            {/* Action row */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", position: "relative" }}>
              <button
                onClick={() => setActiveTab("Comps")}
                style={{
                  padding: "9px 18px", background: "#1D9E75", color: "white",
                  border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer",
                }}
              >
                View Comps
              </button>
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  padding: "9px 18px", background: "transparent",
                  color: "var(--color-text-primary)",
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer",
                }}
              >
                Edit inventory
              </button>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowMore((v) => !v)}
                  style={{
                    padding: "9px 14px", background: "transparent",
                    color: "#64748b", border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 8, fontSize: 14, cursor: "pointer",
                  }}
                >
                  More ▾
                </button>
                {showMore && (
                  <>
                    {/* Backdrop */}
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                      onClick={() => setShowMore(false)}
                    />
                    {/* Dropdown */}
                    <div
                      style={{
                        position: "absolute", top: "calc(100% + 6px)", right: 0,
                        background: "white", border: "0.5px solid rgba(0,0,0,0.10)",
                        borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                        minWidth: 180, zIndex: 50, overflow: "hidden",
                      }}
                    >
                      {certUrl && (
                        <a
                          href={certUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setShowMore(false)}
                          style={{
                            display: "block", padding: "10px 14px",
                            fontSize: 13, color: "#0f172a", textDecoration: "none",
                            borderBottom: "0.5px solid rgba(0,0,0,0.06)",
                          }}
                        >
                          View PSA cert ↗
                        </a>
                      )}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(window.location.href).catch(() => {});
                          setShowMore(false);
                        }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "10px 14px", fontSize: 13, color: "#0f172a",
                          background: "none", border: "none", cursor: "pointer",
                          borderBottom: certUrl ? "none" : "0.5px solid rgba(0,0,0,0.06)",
                        }}
                      >
                        Copy card link
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Investment summary */}
          <div style={{ ...surface, padding: "20px 24px" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.09em", color: "#94a3b8", fontWeight: 500, marginBottom: 14 }}>
              Investment summary
            </div>

            {(
              [
                { label: "Cost basis", value: formatCurrency(card.purchase_price) },
                { label: "Market value", value: cmv ? formatCurrency(cmv) : "—" },
                {
                  label: "Unrealized gain",
                  value: gainLoss ? formatCurrency(gainLoss.amount) : "—",
                  colored: true,
                  positive: gainLoss ? gainLoss.amount >= 0 : null,
                  prefixPlus: gainLoss && gainLoss.amount > 0,
                },
                {
                  label: "Return %",
                  value: gainLoss ? formatPct(gainLoss.pct) : "—",
                  colored: true,
                  positive: gainLoss ? gainLoss.pct >= 0 : null,
                },
                { label: "My valuation", value: null, placeholder: "Not set — add target" },
                { label: "Listing status", value: null, badge: statusLabel },
              ] as Array<{
                label: string;
                value: string | null;
                colored?: boolean;
                positive?: boolean | null;
                placeholder?: string;
                badge?: string;
                prefixPlus?: boolean;
              }>
            ).map((row, i, arr) => (
              <div
                key={row.label}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "11px 0",
                  borderBottom: i < arr.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none",
                }}
              >
                <span style={{ fontSize: 14, color: "#64748b" }}>{row.label}</span>

                {row.badge ? (
                  <span
                    style={{
                      padding: "3px 10px", borderRadius: 999,
                      background: "#f1f5f9", color: "#475569",
                      fontSize: 12, fontWeight: 500, textTransform: "capitalize",
                    }}
                  >
                    {row.badge}
                  </span>
                ) : row.placeholder && !row.value ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    style={{
                      fontSize: 13, color: "#1D9E75", fontStyle: "italic",
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    {row.placeholder}
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: 14, fontWeight: 500,
                      color: row.colored
                        ? row.positive === true ? "#1D9E75" : row.positive === false ? "#DC2626" : "#0f172a"
                        : "var(--color-text-primary)",
                    }}
                  >
                    {row.prefixPlus ? `+${row.value}` : row.value}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Details card with tabs */}
          <div style={{ ...surface, overflow: "hidden" }}>
            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: "0.5px solid rgba(0,0,0,0.08)", padding: "0 24px" }}>
              {(["Details", "Shop", "Comps"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "14px 0", marginRight: 24,
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 14,
                    fontWeight: activeTab === tab ? 500 : 400,
                    color: activeTab === tab ? "#1D9E75" : "#64748b",
                    borderBottom: activeTab === tab ? "2px solid #1D9E75" : "2px solid transparent",
                    transition: "color 120ms ease, border-color 120ms ease",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ padding: "20px 24px" }}>
              {activeTab === "Details" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px 16px" }}>
                  {[
                    { label: "Condition", value: card.grade ? "Graded" : "Raw" },
                    { label: "Grading co.", value: card.grading_company || "—" },
                    { label: "Grade", value: card.grade || "—" },
                    { label: "Set", value: card.set_name || "—" },
                    { label: "Year", value: card.year || "—" },
                    { label: "Player", value: card.player_name || "—" },
                  ].map((d) => (
                    <div key={d.label}>
                      <StatLabel>{d.label}</StatLabel>
                      <div style={{ fontSize: 14, color: "var(--color-text-primary)", fontWeight: 400 }}>{d.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "Shop" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px 16px" }}>
                  {[
                    { label: "Status", value: statusLabel },
                    { label: "Quantity", value: String(card.quantity ?? 1) },
                    { label: "Acquisition", value: card.acquisition_type ? card.acquisition_type.charAt(0).toUpperCase() + card.acquisition_type.slice(1) : "—" },
                  ].map((d) => (
                    <div key={d.label}>
                      <StatLabel>{d.label}</StatLabel>
                      <div style={{ fontSize: 14, color: "var(--color-text-primary)", fontWeight: 400, textTransform: "capitalize" }}>{d.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "Comps" && (
                <CompsMarketplaces card={card} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Below the fold ────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 48px" }}>
        <CompsAndCmvSection card={card} />

        <section className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {gradingCopy.panel.title}
            </h2>
            <Link href="/grade-estimator" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Full grade estimator
            </Link>
          </div>
          {imageUrls.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add at least one photo to run a grade probability analysis.
            </p>
          ) : (
            <>
              {!gradeEstimate.estimate && !gradeEstimate.isRunning && !gradeEstimate.error && (
                <button
                  type="button"
                  onClick={() => void gradeEstimate.run()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Run grade estimate
                </button>
              )}
              {gradeEstimate.isRunning && gradeEstimate.job && (
                <GradeEstimateProgressPanel
                  status={gradeEstimate.job.status}
                  steps={gradeEstimate.job.steps}
                  identityLabel={gradeEstimate.job.partial?.identity ? undefined : null}
                  errorMessage={gradeEstimate.job.error ?? null}
                />
              )}
              {gradeEstimate.error && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-amber-600 dark:text-amber-400">{gradeEstimate.error}</p>
                  <button
                    type="button"
                    onClick={() => { gradeEstimate.reset(); void gradeEstimate.run(); }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              )}
              {gradeEstimate.estimate && (
                <div className="mt-4">
                  <GradeProbabilityPanel
                    estimate={gradeEstimate.estimate}
                    cardIdentity={cardIdentity}
                    primaryImageUrl={imageUrls[0] ?? null}
                    imageUrls={imageUrls}
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
