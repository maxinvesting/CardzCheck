"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { CollectionItem, CardImage } from "@/types";
import CardImageGallery from "@/components/CardImageGallery";
import CardDetailsForm from "@/components/CardDetailsForm";

export default function CardProfilePage() {
  const params = useParams();
  const router = useRouter();
  const cardId = params.id as string;

  const [card, setCard] = useState<CollectionItem | null>(null);
  const [images, setImages] = useState<CardImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCard();
  }, [cardId]);

  const fetchCard = async () => {
    try {
      const response = await fetch(`/api/cards/${cardId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError("Card not found");
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
          purchase_price: card.purchase_price,
          purchase_date: card.purchase_date,
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
              onClick={() => router.push("/collection")}
              className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Back to Collection
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
            onClick={() => router.push("/collection")}
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
            Back to Collection
          </button>
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
      </div>
    </div>
  );
}
