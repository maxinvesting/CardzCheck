"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatSetLabel, needsYearConfirmation, shouldDisplayYear } from "@/lib/card-identity/ui";
import {
  CONDITION_OPTIONS,
  type CardIdentificationResult,
  type CardIdentificationResponse,
  type CollectionItem,
  type CardIdentity,
} from "@/types";

interface AddCardModalNewProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (playerName: string, item?: CollectionItem) => void;
  onLimitReached: () => void;
  addMode?: "collection" | "watchlist";
  /** Optional: for collection mode, open the CardPicker flow instead of manual entry */
  onOpenSmartSearch?: () => void;
  onCardSelected?: (cardData: {
    player_name: string;
    year?: string;
    set_name?: string;
    card_number?: string;
    parallel_type?: string;
    grade?: string;
  }) => void;
}

type ModalMode = "select" | "upload" | "manual" | "confirm";

export default function AddCardModalNew({
  isOpen,
  onClose,
  onSuccess,
  onLimitReached,
  addMode = "collection",
  onOpenSmartSearch,
  onCardSelected,
}: AddCardModalNewProps) {
  const [mode, setMode] = useState<ModalMode>("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCardPicker = addMode === "collection" && Boolean(onOpenSmartSearch);

  // Upload mode state
  const [previews, setPreviews] = useState<string[]>([]);
  const [identifiedCard, setIdentifiedCard] = useState<CardIdentificationResult | null>(null);

  // Manual mode state
  const [manualForm, setManualForm] = useState({
    player_name: "",
    year: "",
    set_name: "",
    parallel_type: "",
  });

  // Confirm mode state
  const [costBasisType, setCostBasisType] = useState<"pulled" | "paid">("pulled");
  const [purchasePrice, setPurchasePrice] = useState<string>("");
  const [condition, setCondition] = useState<string>("Raw");
  const [editingYear, setEditingYear] = useState(false);
  const [yearDraft, setYearDraft] = useState("");

  const resetForm = () => {
    setMode("select");
    setLoading(false);
    setError(null);
    setPreviews([]);
    setIdentifiedCard(null);
    setManualForm({ player_name: "", year: "", set_name: "", parallel_type: "" });
    setCostBasisType("pulled");
    setPurchasePrice("");
    setCondition("Raw");
    setEditingYear(false);
    setYearDraft("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFiles = useCallback(async (files: FileList) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    if (incoming.length > 2) {
      setError("Upload up to 2 images (front + back).");
      return;
    }

    for (const file of incoming) {
      if (!file.type.startsWith("image/")) {
        setError("Please upload image files only");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("Each image must be less than 10MB");
        return;
      }
    }

    setError(null);
    setLoading(true);
    setIdentifiedCard(null);
    setEditingYear(false);
    setYearDraft("");

    const previewUrls = await Promise.all(
      incoming.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setPreviews(previewUrls);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const imageUrls = await Promise.all(
        incoming.map(async (file, index) => {
          if (!user) {
            return previewUrls[index];
          }
          const fileName = `${user.id}/${Date.now()}-${file.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("card-images")
            .upload(fileName, file);

          if (uploadError) {
            return previewUrls[index];
          }

          const { data: { publicUrl } } = supabase.storage
            .from("card-images")
            .getPublicUrl(uploadData.path);
          return publicUrl;
        })
      );

      const response = await fetch("/api/identify-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          imageUrls.length > 1 ? { imageUrls } : { imageUrl: imageUrls[0] }
        ),
      });

      const result: CardIdentificationResponse = await response.json();

      if ("error" in result) {
        setError(result.reason || result.error);
        setLoading(false);
        setIdentifiedCard(null);
        return;
      }

      // Success - set identified card (NO gradeEstimate - that's separate)
      setIdentifiedCard({
        player_name: result.player_name,
        players: result.players || [result.player_name],
        year: result.year || undefined,
        set_name: result.set_name || undefined,
        insert: result.insert || undefined,
        grade: result.grade || undefined,
        parallel_type: result.variant || undefined,
        imageUrl: imageUrls[0],
        imageUrls,
        confidence: result.confidence,
        cardIdentity: result.card_identity,
      });
      setYearDraft(result.year || "");
      setMode("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process image");
      setIdentifiedCard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (identifiedCard) {
      setYearDraft(identifiedCard.year || "");
    }
  }, [identifiedCard]);

  const buildFallbackIdentity = (card: CardIdentificationResult): CardIdentity => ({
    player: card.player_name || null,
    setName: card.set_name || null,
    year: card.year ? Number(card.year) : null,
    brand: null,
    subset: null,
    sport: null,
    league: null,
    cardNumber: card.card_number || null,
    rookie: null,
    parallel: card.parallel_type || null,
    cardStock: "unknown",
    confidence: card.confidence,
    fieldConfidence: {
      player: card.player_name ? "medium" : "low",
      setName: card.set_name ? "medium" : "low",
      year: card.year ? "medium" : "low",
    },
    sources: {},
    warnings: [],
    evidenceSummary: null,
  });

  const applyYearOverride = (nextYear: string) => {
    const trimmed = nextYear.trim();
    if (trimmed && !/^\d{4}$/.test(trimmed)) {
      setError("Year must be a 4-digit number");
      return;
    }

    setIdentifiedCard((prev) => {
      if (!prev) return prev;
      const identity = prev.cardIdentity ? { ...prev.cardIdentity } : buildFallbackIdentity(prev);
      const yearNumber = trimmed ? Number(trimmed) : undefined;
      const nextIdentity: CardIdentity = {
        ...identity,
        year: yearNumber ?? null,
        fieldConfidence: {
          ...identity.fieldConfidence,
          year: trimmed ? "high" : "low",
        },
        sources: {
          ...identity.sources,
          year: trimmed ? "user" : identity.sources.year,
        },
      };
      return {
        ...prev,
        year: trimmed || undefined,
        confirmedYear: trimmed || undefined,
        cardIdentity: nextIdentity,
      };
    });
    setEditingYear(false);
  };

  const handleManualSubmit = () => {
    if (!manualForm.player_name.trim()) {
      setError("Player name is required");
      return;
    }
    const manualYear = manualForm.year.trim();
    const manualIdentity: CardIdentity = {
      player: manualForm.player_name.trim() || null,
      year: manualYear && /^\d{4}$/.test(manualYear) ? Number(manualYear) : null,
      brand: null,
      setName: manualForm.set_name.trim() || null,
      subset: null,
      sport: null,
      league: null,
      cardNumber: null,
      rookie: null,
      parallel: manualForm.parallel_type.trim() || null,
      cardStock: "unknown",
      confidence: "high",
      fieldConfidence: {
        player: manualForm.player_name.trim() ? "high" : "low",
        setName: manualForm.set_name.trim() ? "high" : "low",
        year: manualYear && /^\d{4}$/.test(manualYear) ? "high" : "low",
      },
      sources: {
        player: "user",
        setName: "user",
        year: manualYear && /^\d{4}$/.test(manualYear) ? "user" : "inferred",
      },
      warnings: [],
      evidenceSummary: null,
    };
    setIdentifiedCard({
      player_name: manualForm.player_name,
      year: manualForm.year || undefined,
      set_name: manualForm.set_name || undefined,
      parallel_type: manualForm.parallel_type || undefined,
      imageUrl: "",
      confidence: "high",
      cardIdentity: manualIdentity,
    });
    setMode("confirm");
  };

  const handleConfirm = async () => {
    if (!identifiedCard?.player_name) {
      setError("Card data is missing");
      return;
    }

    // For watchlist mode, pass card data to onCardSelected and close
    if (addMode === "watchlist" && onCardSelected) {
      const cardData = {
        player_name: identifiedCard.player_name,
        year: identifiedCard.year,
        set_name: identifiedCard.set_name,
        card_number: identifiedCard.card_number,
        parallel_type: identifiedCard.parallel_type,
        grade: condition,
      };
      onCardSelected(cardData);
      resetForm();
      onClose();
      return;
    }

    // Collection mode - add directly to collection
    setLoading(true);
    setError(null);

    try {
      const notesParts: string[] = [];
      if (identifiedCard.parallel_type && identifiedCard.parallel_type !== "Base") {
        notesParts.push(`Parallel: ${identifiedCard.parallel_type}`);
      }

      const body = {
        player_name: identifiedCard.player_name,
        year: identifiedCard.year || null,
        set_name: identifiedCard.set_name || null,
        grade: condition,
        purchase_price:
          costBasisType === "paid" && purchasePrice ? parseFloat(purchasePrice) : null,
        purchase_date: null,
        image_url: identifiedCard.imageUrl || null,
        image_urls: identifiedCard.imageUrls || [identifiedCard.imageUrl].filter(Boolean),
        notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
      };

      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "limit_reached") {
          onLimitReached();
          handleClose();
          return;
        }
        throw new Error(data.error || "Failed to add card");
      }

      onSuccess(identifiedCard.player_name, data.item ?? undefined);
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card");
    } finally {
      setLoading(false);
    }
  };

  const yearFieldConfidence = identifiedCard?.cardIdentity?.fieldConfidence?.year;
  const showYear = identifiedCard
    ? shouldDisplayYear(identifiedCard.year, identifiedCard.confidence, yearFieldConfidence)
    : false;
  const yearNeedsConfirmation = identifiedCard
    ? needsYearConfirmation(identifiedCard.year, identifiedCard.confidence, yearFieldConfidence)
    : false;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {mode === "select" && (addMode === "watchlist" ? "Add Card to Watchlist" : "Add Card to Collection")}
            {mode === "upload" && "Upload Card Photo"}
            {mode === "manual" && "Enter Card Details"}
            {mode === "confirm" && "Confirm Card"}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Select Mode */}
          {mode === "select" && (
            <div className="space-y-4">
              <button
                onClick={() => setMode("upload")}
                className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800/30 transition-colors">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">Upload Card Photo</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">AI identifies the card and estimates grade</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  if (hasCardPicker && onOpenSmartSearch) {
                    onOpenSmartSearch();
                    return;
                  }
                  setMode("manual");
                }}
                className="w-full p-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center group-hover:bg-green-200 dark:group-hover:bg-green-800/30 transition-colors">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {hasCardPicker ? "Find in Card Database" : "Enter Manually"}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {hasCardPicker
                        ? "Use structured filters to pick the exact card"
                        : "Type the card details yourself"}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Upload Mode */}
          {mode === "upload" && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-400">Processing card...</p>
                </div>
              ) : previews.length > 0 ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-3 flex-wrap justify-center">
                    {previews.map((preview, index) => (
                      <img
                        key={`${preview}-${index}`}
                        src={preview}
                        alt={`Card preview ${index + 1}`}
                        className="h-32 w-24 object-cover rounded-lg shadow-md"
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {previews.length} photo{previews.length > 1 ? "s" : ""} selected
                  </p>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:border-blue-500 dark:hover:border-blue-500 transition-colors">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Drop your card photos here
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      or click to select (front + back)
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const fileList = e.target.files;
                      if (fileList && fileList.length > 0) {
                        handleFiles(fileList);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              )}

              <button
                onClick={() => setMode("select")}
                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
              >
                Back
              </button>
            </div>
          )}

          {/* Manual Mode */}
          {mode === "manual" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Player Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={manualForm.player_name}
                  onChange={(e) => setManualForm({ ...manualForm, player_name: e.target.value })}
                  placeholder="e.g., Michael Jordan"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Year
                </label>
                <input
                  type="text"
                  value={manualForm.year}
                  onChange={(e) => setManualForm({ ...manualForm, year: e.target.value })}
                  placeholder="e.g., 1986"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Set / Brand
                </label>
                <input
                  type="text"
                  value={manualForm.set_name}
                  onChange={(e) => setManualForm({ ...manualForm, set_name: e.target.value })}
                  placeholder="e.g., Fleer, Panini Prizm"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Parallel / Variant
                </label>
                <input
                  type="text"
                  value={manualForm.parallel_type}
                  onChange={(e) => setManualForm({ ...manualForm, parallel_type: e.target.value })}
                  placeholder="e.g., Silver Prizm, Refractor"
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setMode("select")}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
                >
                  Back
                </button>
                <button
                  onClick={handleManualSubmit}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Confirm Mode */}
          {mode === "confirm" && identifiedCard && (
            <div className="space-y-5">
              {/* Card Preview */}
              <div className="flex gap-4">
                {identifiedCard.imageUrl && (
                  <div className="flex-shrink-0 space-y-2">
                    <img
                      src={identifiedCard.imageUrl}
                      alt={identifiedCard.player_name}
                      className="w-24 h-32 object-cover rounded-lg shadow-md bg-gray-200 dark:bg-gray-800"
                    />
                    {identifiedCard.imageUrls && identifiedCard.imageUrls.length > 1 ? (
                      <div className="flex gap-2">
                        {identifiedCard.imageUrls.slice(1, 3).map((url, index) => (
                          <img
                            key={`${url}-${index}`}
                            src={url}
                            alt={`${identifiedCard.player_name} alt ${index + 1}`}
                            className="w-10 h-14 object-cover rounded-md border border-gray-200 dark:border-gray-700"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                    {identifiedCard.player_name}
                  </h3>
                  <div className="mt-1 space-y-0.5 text-sm text-gray-600 dark:text-gray-400">
                    {showYear ? (
                      <p>Year: {identifiedCard.year}</p>
                    ) : yearNeedsConfirmation ? (
                      <div className="flex items-center gap-2">
                        <p>Year: Needs confirmation</p>
                        <button
                          type="button"
                          onClick={() => setEditingYear(true)}
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          Edit
                        </button>
                      </div>
                    ) : null}
                    {editingYear ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={yearDraft}
                          onChange={(e) => setYearDraft(e.target.value)}
                          placeholder="e.g., 2025"
                          className="w-24 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-gray-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => applyYearOverride(yearDraft)}
                          className="text-xs text-green-600 hover:text-green-700 dark:text-green-400"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingYear(false);
                            setYearDraft(identifiedCard.year || "");
                          }}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                    {(() => {
                      const { setLabel } = formatSetLabel(
                        identifiedCard.cardIdentity,
                        identifiedCard.set_name,
                        identifiedCard.parallel_type
                      );
                      return setLabel ? <p>Set: {setLabel}</p> : null;
                    })()}
                    {identifiedCard.cardIdentity?.parallel &&
                      identifiedCard.cardIdentity.parallel !== "Base" && (
                        <p>Parallel: {identifiedCard.cardIdentity.parallel}</p>
                      )}
                  </div>
                </div>
              </div>

              {identifiedCard.cardIdentity?.warnings?.includes("parse_error") ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    We couldn’t read all card details. Please confirm the year and set below.
                  </p>
                </div>
              ) : null}

              {/* Form Fields - Only show for collection mode */}
              {addMode === "collection" && (
                <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-800">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Cost basis
                    </label>
                    <div className="flex gap-3 mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="costBasis"
                          checked={costBasisType === "pulled"}
                          onChange={() => setCostBasisType("pulled")}
                          className="rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Pulled (no cost)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="costBasis"
                          checked={costBasisType === "paid"}
                          onChange={() => setCostBasisType("paid")}
                          className="rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">I paid</span>
                      </label>
                    </div>
                    {costBasisType === "paid" && (
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input
                          type="number"
                          value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className="w-full pl-7 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Condition
                    </label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {CONDITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setIdentifiedCard(null);
                    setMode("select");
                    setPreviews([]);
                  }}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {loading ? "Adding..." : addMode === "watchlist" ? "Continue to Set Target Price" : "Add to Collection"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
