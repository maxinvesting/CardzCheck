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
          // Backward-compatibility: old links may pass business inventory item ids.
          // Try unified profile routes before showing a hard 404.
          const businessProfileResponse = await fetch(
            `/api/card-profile/${cardId}?from=business`,
            { cache: "no-store" }
          );
          if (businessProfileResponse.ok) {
            const businessProfile = await businessProfileResponse
              .json()
              .catch(() => null);
            const businessItemId =
              typeof businessProfile?.item?.id === "string" &&
              businessProfile.item.id.length > 0
                ? businessProfile.item.id
                : cardId;
            router.replace(`/card/${businessItemId}?from=business`);
            return;
          }

          const collectionProfileResponse = await fetch(
            `/api/card-profile/${cardId}?from=collection`,
            { cache: "no-store" }
          );
          if (collectionProfileResponse.ok) {
            const collectionProfile = await collectionProfileResponse
              .json()
              .catch(() => null);
            const collectionItemId =
              typeof collectionProfile?.item?.id === "string" &&
              collectionProfile.item.id.length > 0
                ? collectionProfile.item.id
                : cardId;
            router.replace(`/card/${collectionItemId}?from=collection`);
            return;
          }

          // Final fallback: hand off to unified profile route so it can run
          // cross-mode resolution logic.
          router.replace(`/card/${cardId}?from=business`);
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
              acquisition_type: card.acquisition_type,
              purchase_price: card.purchase_price,
              purchase_date: card.purchase_date,
              image_url: card.image_url,
              user_image_url: card.user_image_url,
              stock_image_url: card.stock_image_url,
              ebay_image_url: card.ebay_image_url,
              notes: card.notes,
            }),
      });

      if (!response.ok) {
        throw new Error("Failed to save card");
      }

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

      if (!response.ok) {
        throw new Error("Failed to add card to inventory");
      }

      const data = await response.json();
      if (data?.item) {
        setCard(data.item);
      }
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
    const legacy: string[] = [];
    if (card.image_url) legacy.push(card.image_url);
    if (card.user_image_url) legacy.push(card.user_image_url);
    if (card.stock_image_url) legacy.push(card.stock_image_url);
    if (card.ebay_image_url) legacy.push(card.ebay_image_url);
    return legacy;
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

  const gradeEstimate = useGradeEstimateFromImages({
    imageUrls,
    card: cardIdentity,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <svg
                className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p className="text-gray-600 dark:text-gray-400">Loading card...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {error || "Card not found"}
            </h2>
            <button
              onClick={() => router.push(isBusinessUser ? "/business" : "/collection")}
              className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              {isBusinessUser ? "Back to Business" : "Back to Collection"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push(isBusinessUser ? "/business" : "/collection")}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-4"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {isBusinessUser ? "Back to Business" : "Back to Collection"}
          </button>
          {isBusinessUser && card.item_kind !== "inventory" && (
            <button
              onClick={handlePromoteToInventory}
              disabled={promotingToInventory}
              className="mb-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {promotingToInventory ? "Adding to Inventory..." : "Add to Inventory"}
            </button>
          )}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {card.player_name}
            {card.year && ` (${card.year})`}
          </h1>
          {card.set_name && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {card.set_name}
              {card.insert && ` - ${card.insert}`}
            </p>
          )}
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left column: Image gallery */}
          <div>
            <CardImageGallery
              cardId={cardId}
              images={images}
              onImagesChange={setImages}
            />
          </div>

          {/* Right column: Card details */}
          <div>
            <CardDetailsForm
              card={card}
              onUpdate={handleUpdateCard}
              onSave={handleSaveCard}
              saving={saving}
            />
          </div>
        </div>

        {/* Grade probability section */}
        <section className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {gradingCopy.panel.title}
            </h2>
            <Link
              href="/grade-estimator"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Full grade estimator
            </Link>
          </div>
          {imageUrls.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add at least one photo above to run a grade probability analysis.
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
