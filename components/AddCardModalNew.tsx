"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatSetLabel, needsYearConfirmation, shouldDisplayYear } from "@/lib/card-identity/ui";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";
import { identifyCardFromImages } from "@/lib/identify-card/client";
import { normalizeHttpUrl, uniqueHttpUrls } from "@/lib/collection-images";
import { usePsaLookup, type PsaLookupResult } from "@/hooks/usePsaLookup";
import {
  CONDITION_OPTIONS,
  type AcquisitionType,
  type CardIdentificationResult,
  type CollectionItem,
  type CardIdentity,
} from "@/types";

interface AddCardModalNewProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (playerName: string, item?: CollectionItem) => void;
  onLimitReached: () => void;
  addMode?: "collection" | "watchlist" | "business";
  /** Optional: override the modal title in select mode (e.g. "Add Card to Inventory") */
  modalTitle?: string;
  /** Optional: for collection/business, open the CardPicker flow instead of manual entry */
  onOpenSmartSearch?: () => void;
  onCardSelected?: (cardData: {
    card_id?: string;
    player_name: string;
    year?: string;
    set_name?: string;
    card_number?: string;
    parallel_type?: string;
    grade?: string;
    grader?: string;
    psa_cert_number?: string;
    imageUrl?: string;
    imageUrls?: string[];
    user_image_url?: string;
    quantity?: number;
    /** True when the card was typed in by hand — downstream flows must not run any lookup/search. */
    manualEntry?: boolean;
  }) => void;
}

type ModalMode =
  | "kind"
  | "select"
  | "upload"
  | "manual"
  | "confirm"
  | "graded_company"
  | "graded_cert"
  | "graded_manual"
  | "graded_confirm";

type GradingCompany = "PSA" | "BGS" | "SGC" | "CGC";

const GRADING_COMPANIES: { value: GradingCompany; label: string; description: string }[] = [
  { value: "PSA", label: "PSA", description: "Auto-lookup by certification number" },
  { value: "BGS", label: "BGS", description: "Beckett — manual entry" },
  { value: "SGC", label: "SGC", description: "Sportscard Guaranty — manual entry" },
  { value: "CGC", label: "CGC", description: "Certified Guaranty Company — manual entry" },
];
const MAX_IDENTIFY_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FALLBACK_DATA_URL_BYTES = 350 * 1024;
const GRADE_WITH_COMPANY_PATTERN = /^(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)$/i;
const NUMERIC_GRADE_PATTERN = /^\d+(?:\.\d+)?$/;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlByteLength(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return 0;
  const base64 = dataUrl.slice(commaIndex + 1);
  const padding =
    base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function isDataUrl(value: string): boolean {
  return value.trim().startsWith("data:");
}

async function compressDataUrl(
  dataUrl: string,
  options: { maxWidth: number; maxHeight: number; quality: number }
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(
        1,
        options.maxWidth / image.width,
        options.maxHeight / image.height
      );
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", options.quality));
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function normalizeDetectedGrade(rawGrade?: string | null): string | null {
  if (!rawGrade) return null;
  const trimmed = rawGrade.trim();
  if (!trimmed) return null;
  if (/^raw$/i.test(trimmed) || /^ungraded$/i.test(trimmed)) return "Raw";

  const withCompany = trimmed.match(GRADE_WITH_COMPANY_PATTERN);
  if (withCompany?.[1] && withCompany[2]) {
    return `${withCompany[1].toUpperCase()} ${withCompany[2]}`;
  }

  if (NUMERIC_GRADE_PATTERN.test(trimmed)) {
    const inferredCompany = trimmed.includes(".5") ? "BGS" : "PSA";
    return `${inferredCompany} ${trimmed}`;
  }

  return null;
}

function buildCardIdentificationFromPsa(psa: PsaLookupResult): CardIdentificationResult {
  const yearStr = psa.year?.trim() || "";
  const cardIdentity: CardIdentity = {
    player: psa.player_name?.trim() || null,
    year: yearStr && /^\d{4}$/.test(yearStr) ? Number(yearStr) : null,
    brand: null,
    setName: psa.set_name?.trim() || null,
    subset: null,
    sport: null,
    league: null,
    cardNumber: psa.card_number?.trim() || null,
    rookie: null,
    parallel: psa.parallel_type?.trim() || null,
    cardStock: "unknown",
    confidence: "high",
    fieldConfidence: {
      player: psa.player_name?.trim() ? "high" : "low",
      setName: psa.set_name?.trim() ? "high" : "low",
      year: yearStr && /^\d{4}$/.test(yearStr) ? "high" : "low",
    },
    sources: {
      player: "user",
      setName: psa.set_name?.trim() ? "user" : "inferred",
      year: yearStr && /^\d{4}$/.test(yearStr) ? "user" : "inferred",
    },
    warnings: [],
    evidenceSummary: null,
  };

  return {
    player_name: psa.player_name || "",
    year: psa.year || undefined,
    set_name: psa.set_name || undefined,
    card_number: psa.card_number || undefined,
    parallel_type: psa.parallel_type || undefined,
    grade: psa.grade || undefined,
    imageUrl: "",
    confidence: "high",
    cardIdentity,
  };
}

function normalizeManualGrade(rawGrade: string, company: GradingCompany): string | undefined {
  const trimmed = rawGrade.trim();
  if (!trimmed) return undefined;
  const companyPrefix = new RegExp(`^(PSA|BGS|SGC|CGC)\\s+`, "i");
  if (companyPrefix.test(trimmed)) {
    return trimmed.replace(/^[a-z]+/i, (m) => m.toUpperCase());
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return `${company} ${trimmed}`;
  return trimmed;
}

export default function AddCardModalNew({
  isOpen,
  onClose,
  onSuccess,
  onLimitReached,
  addMode = "collection",
  modalTitle,
  onOpenSmartSearch,
  onCardSelected,
}: AddCardModalNewProps) {
  const hasCardPicker = Boolean(onOpenSmartSearch);
  /**
   * Raw vs graded first step for business inventory and personal collection.
   * Intentionally does NOT require `onOpenSmartSearch` (dashboard quick-add had no picker and skipped this entirely).
   */
  const showKindStep = addMode === "business" || addMode === "collection";

  const [mode, setMode] = useState<ModalMode>(() => (showKindStep ? "kind" : "select"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gradedCertInput, setGradedCertInput] = useState("");
  const [gradedCompany, setGradedCompany] = useState<GradingCompany>("PSA");
  const {
    lookup: lookupPsaCert,
    lookupImmediate: lookupPsaCertImmediate,
    isLoading: psaLoading,
    result: psaResult,
    error: psaError,
    clearResult: clearPsa,
  } = usePsaLookup();

  // Upload mode state
  const [previews, setPreviews] = useState<string[]>([]);
  const [identifiedCard, setIdentifiedCard] = useState<CardIdentificationResult | null>(null);
  /**
   * True while the current confirm/submit originated from hand-typed entry.
   * Manual add is a pure passthrough — we never search/identify the card, and
   * downstream inventory steps must not run a value lookup either.
   */
  const [manualEntry, setManualEntry] = useState(false);

  // Manual mode state
  const [manualForm, setManualForm] = useState({
    player_name: "",
    year: "",
    set_name: "",
    parallel_type: "",
  });
  const [gradedManualForm, setGradedManualForm] = useState({
    player_name: "",
    year: "",
    set_name: "",
    card_number: "",
    parallel_type: "",
    grade: "",
  });

  // Confirm mode state
  const [acquisitionType, setAcquisitionType] = useState<AcquisitionType>("pulled");
  const [quantity, setQuantity] = useState<string>("1");
  const [purchasePrice, setPurchasePrice] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<string>("");
  const [condition, setCondition] = useState<string>("Raw");
  const [editingYear, setEditingYear] = useState(false);
  const [yearDraft, setYearDraft] = useState("");
  /** Set when collection flow continues from graded PSA confirm → acquisition step. */
  const [collectionGradedCertDigits, setCollectionGradedCertDigits] = useState<string | null>(
    null
  );

  const resetForm = useCallback(() => {
    setMode(showKindStep ? "kind" : "select");
    setLoading(false);
    setError(null);
    setPreviews([]);
    setIdentifiedCard(null);
    setManualEntry(false);
    setManualForm({ player_name: "", year: "", set_name: "", parallel_type: "" });
    setGradedManualForm({
      player_name: "",
      year: "",
      set_name: "",
      card_number: "",
      parallel_type: "",
      grade: "",
    });
    setAcquisitionType("pulled");
    setQuantity("1");
    setPurchasePrice("");
    setPurchaseDate("");
    setCondition("Raw");
    setEditingYear(false);
    setYearDraft("");
    setGradedCertInput("");
    setGradedCompany("PSA");
    setCollectionGradedCertDigits(null);
    clearPsa();
  }, [showKindStep, clearPsa]);

  const prevIsOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      resetForm();
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, resetForm]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGradedInventoryConfirm = () => {
    if (!onCardSelected || !psaResult?.player_name) {
      setError("Card details are missing. Check the cert number and try again.");
      return;
    }
    const parsedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
    const certDigits = gradedCertInput.replace(/\D/g, "");
    const psaImageUrls = psaResult.image_urls ?? [];
    onCardSelected({
      player_name: psaResult.player_name,
      year: psaResult.year ?? undefined,
      set_name: psaResult.set_name ?? undefined,
      card_number: psaResult.card_number ?? undefined,
      parallel_type: psaResult.parallel_type ?? undefined,
      grade: psaResult.grade ?? undefined,
      grader: "PSA",
      psa_cert_number: certDigits || undefined,
      imageUrl: psaImageUrls[0] ?? undefined,
      imageUrls: psaImageUrls,
      user_image_url: psaImageUrls[0] ?? undefined,
      quantity: parsedQuantity,
    });
    resetForm();
    onClose();
  };

  const openGradedManualEntry = () => {
    setError(null);
    setGradedManualForm((prev) => ({
      player_name: psaResult?.player_name ?? prev.player_name,
      year: psaResult?.year ?? prev.year,
      set_name: psaResult?.set_name ?? prev.set_name,
      card_number: psaResult?.card_number ?? prev.card_number,
      parallel_type: psaResult?.parallel_type ?? prev.parallel_type,
      grade: psaResult?.grade?.replace(/^PSA\s*/i, "") ?? prev.grade,
    }));
    setMode("graded_manual");
  };

  const handleGradedManualSubmit = () => {
    const playerName = gradedManualForm.player_name.trim();
    const year = gradedManualForm.year.trim();

    if (!playerName) {
      setError("Player name is required.");
      return;
    }

    if (year && !/^\d{4}$/.test(year)) {
      setError("Year must be a 4-digit number.");
      return;
    }

    const parsedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
    const certDigits = gradedCertInput.replace(/\D/g, "");
    const grade = normalizeManualGrade(gradedManualForm.grade, gradedCompany);
    const setName = gradedManualForm.set_name.trim();
    const cardNumber = gradedManualForm.card_number.trim();
    const parallelType = gradedManualForm.parallel_type.trim();

    if ((addMode === "watchlist" || addMode === "business") && onCardSelected) {
      const psaImageUrls =
        gradedCompany === "PSA" && psaResult?.image_urls ? psaResult.image_urls : [];
      onCardSelected({
        player_name: playerName,
        year: year || undefined,
        set_name: setName || undefined,
        card_number: cardNumber || undefined,
        parallel_type: parallelType || undefined,
        grade,
        grader: gradedCompany,
        psa_cert_number: gradedCompany === "PSA" && certDigits ? certDigits : undefined,
        imageUrl: psaImageUrls[0] ?? undefined,
        imageUrls: psaImageUrls,
        user_image_url: psaImageUrls[0] ?? undefined,
        quantity: parsedQuantity,
        manualEntry: true,
      });
      resetForm();
      onClose();
      return;
    }

    const manualIdentity: CardIdentity = {
      player: playerName,
      year: year ? Number(year) : null,
      brand: null,
      setName: setName || null,
      subset: null,
      sport: null,
      league: null,
      cardNumber: cardNumber || null,
      rookie: null,
      parallel: parallelType || null,
      cardStock: "unknown",
      confidence: "high",
      fieldConfidence: {
        player: "high",
        setName: setName ? "high" : "low",
        year: year ? "high" : "low",
      },
      sources: {
        player: "user",
        setName: setName ? "user" : "inferred",
        year: year ? "user" : "inferred",
      },
      warnings: certDigits ? [`${gradedCompany} cert ${certDigits} entered manually`] : [],
      evidenceSummary: null,
    };

    setIdentifiedCard({
      player_name: playerName,
      year: year || undefined,
      set_name: setName || undefined,
      card_number: cardNumber || undefined,
      parallel_type: parallelType || undefined,
      grade,
      imageUrl: "",
      confidence: "high",
      cardIdentity: manualIdentity,
    });
    setCondition(grade || "Raw");
    setCollectionGradedCertDigits(certDigits || null);
    setError(null);
    setMode("confirm");
  };

  const proceedGradedToCollectionConfirm = () => {
    if (!psaResult?.player_name || addMode !== "collection") {
      setError("Card details are missing. Check the cert number and try again.");
      return;
    }
    setError(null);
    setManualEntry(false);
    setIdentifiedCard(buildCardIdentificationFromPsa(psaResult));
    const gradeValue = psaResult.grade?.trim();
    const optionMatch = gradeValue
      ? CONDITION_OPTIONS.find((o) => o.value === gradeValue)
      : undefined;
    setCondition(optionMatch?.value ?? (gradeValue || "Raw"));
    setCollectionGradedCertDigits(gradedCertInput.replace(/\D/g, "") || null);
    setMode("confirm");
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
      if (file.size > MAX_IDENTIFY_IMAGE_BYTES) {
        setError("Each image must be less than 8MB");
        return;
      }
    }

    setError(null);
    setLoading(true);
    setIdentifiedCard(null);
    setEditingYear(false);
    setYearDraft("");

    const previewUrls = await Promise.all(incoming.map((file) => readFileAsDataUrl(file)));
    setPreviews(previewUrls);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const imageInputs = await Promise.all(
        incoming.map(async (file, index) => {
          try {
            if (!user) {
              throw new Error("No authenticated user");
            }

            const safeName = file.name.replace(/[^\w.-]+/g, "_");
            const fileName = `${user.id}/${Date.now()}-${index}-${safeName}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("card-images")
              .upload(fileName, file);

            if (uploadError) {
              throw new Error(uploadError.message || "Failed to upload image");
            }

            const { data: { publicUrl } } = supabase.storage
              .from("card-images")
              .getPublicUrl(uploadData.path);
            return publicUrl;
          } catch {
            const preview = previewUrls[index];
            const fallbackBytes = estimateDataUrlByteLength(preview);
            if (fallbackBytes <= MAX_FALLBACK_DATA_URL_BYTES) {
              return preview;
            }
            const compressed = await compressDataUrl(preview, {
              maxWidth: 1200,
              maxHeight: 1200,
              quality: 0.72,
            });
            return compressed || preview;
          }
        })
      );

      const primaryIdentifyImage = imageInputs[0];
      if (!primaryIdentifyImage) {
        throw new Error("Failed to prepare image");
      }

      const hasFallbackDataUrls = imageInputs.some(isDataUrl);
      const identifyInput =
        imageInputs.length > 1 && !hasFallbackDataUrls
          ? { imageUrls: imageInputs }
          : { imageUrl: primaryIdentifyImage };

      const identify = await identifyCardFromImages(identifyInput);

      if (!identify.ok || !identify.data || "error" in identify.data) {
        setError(identify.errorMessage || "Failed to identify card");
        setLoading(false);
        setIdentifiedCard(null);
        return;
      }

      const selectedImageUrls = imageInputs.filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0
      );
      const persistedUserImageUrls = uniqueHttpUrls(selectedImageUrls);
      const primaryUserImage = persistedUserImageUrls[0] || null;
      const result = identify.data;
      const displayImageUrl =
        selectedImageUrls[0] || previewUrls[0] || "";

      // Success - set identified card (NO gradeEstimate - that's separate)
      setManualEntry(false);
      setIdentifiedCard(normalizeIdentificationResult({
        player_name: result.player_name,
        players: result.players || [result.player_name],
        year: result.year || undefined,
        set_name: result.set_name || undefined,
        insert: result.insert || undefined,
        grade: result.grade || undefined,
        parallel_type: result.variant || undefined,
        imageUrl: displayImageUrl,
        imageUrls: selectedImageUrls.length > 0 ? selectedImageUrls : undefined,
        userImageUrl: primaryUserImage || undefined,
        confidence: result.confidence,
        cardIdentity: result.card_identity,
      }));
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
      const normalizedDetected = normalizeDetectedGrade(identifiedCard.grade);
      if (!normalizedDetected) {
        setCondition("Raw");
        return;
      }
      const matchedOption = CONDITION_OPTIONS.find(
        (option) => option.value.toLowerCase() === normalizedDetected.toLowerCase()
      );
      setCondition(matchedOption?.value || "Raw");
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
    setManualEntry(true);
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

    // For watchlist/business mode, pass card data to onCardSelected and close
    if ((addMode === "watchlist" || addMode === "business") && onCardSelected) {
      const parsedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
      const normalizedCondition = normalizeDetectedGrade(condition) || condition;
      const normalizedDetected = normalizeDetectedGrade(identifiedCard.grade);
      const effectiveGrade =
        (normalizedCondition === "Raw" || !normalizedCondition) &&
        normalizedDetected &&
        normalizedDetected !== "Raw"
          ? normalizedDetected
          : normalizedCondition;
      const cardData = {
        player_name: identifiedCard.player_name,
        year: identifiedCard.year,
        set_name: identifiedCard.set_name,
        card_number: identifiedCard.card_number,
        parallel_type: identifiedCard.parallel_type,
        grade: effectiveGrade,
        imageUrl: identifiedCard.imageUrl || undefined,
        imageUrls: identifiedCard.imageUrls || undefined,
        user_image_url: identifiedCard.userImageUrl || undefined,
        quantity: parsedQuantity,
        manualEntry,
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
      const hasPurchasePriceInput =
        acquisitionType !== "pulled" && purchasePrice.trim().length > 0;
      const normalizedPurchasePrice = hasPurchasePriceInput
        ? Number.parseFloat(purchasePrice)
        : null;
      const hasQuantityInput = quantity.trim().length > 0;
      const normalizedQuantity = Number.parseInt(quantity, 10);

      if (
        !hasQuantityInput ||
        !Number.isInteger(normalizedQuantity) ||
        normalizedQuantity < 1
      ) {
        setError("Quantity must be a whole number of 1 or greater");
        setLoading(false);
        return;
      }

      if (
        hasPurchasePriceInput &&
        (normalizedPurchasePrice === null ||
          !Number.isFinite(normalizedPurchasePrice) ||
          normalizedPurchasePrice < 0)
      ) {
        setError("Purchase price must be a valid positive number");
        setLoading(false);
        return;
      }

      const notesParts: string[] = [];
      if (identifiedCard.parallel_type && identifiedCard.parallel_type !== "Base") {
        notesParts.push(`Parallel: ${identifiedCard.parallel_type}`);
      }
      const persistedImageUrls = uniqueHttpUrls([
        identifiedCard.userImageUrl,
        ...(identifiedCard.imageUrls || []),
      ]);
      const canonicalImageUrl =
        normalizeHttpUrl(identifiedCard.userImageUrl || null) ||
        normalizeHttpUrl(identifiedCard.imageUrl || null);

      const certDigits = collectionGradedCertDigits;

      const body = {
        player_name: identifiedCard.player_name,
        year: identifiedCard.year || null,
        set_name: identifiedCard.set_name || null,
        insert: identifiedCard.insert || null,
        parallel_type: identifiedCard.parallel_type || null,
        card_number: identifiedCard.card_number || null,
        grade: condition,
        acquisition_type: acquisitionType,
        purchase_price: acquisitionType === "pulled" ? null : normalizedPurchasePrice,
        purchase_date: purchaseDate || null,
        user_image_url: normalizeHttpUrl(identifiedCard.userImageUrl || null),
        image_url: canonicalImageUrl,
        image_urls: persistedImageUrls,
        notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
        quantity: normalizedQuantity,
        ...(certDigits
          ? { cert_number: certDigits, psa_cert_number: certDigits }
          : {}),
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
  const showingBestMatchInDatabase = identifiedCard
    ? !identifiedCard.userImageUrl &&
      Boolean(identifiedCard.imageUrl) &&
      !isDataUrl(identifiedCard.imageUrl || "")
    : false;
  const currentGradedCertDigits = gradedCertInput.replace(/\D/g, "");

  // Shared dark-theme classes
  const inputCls = "w-full border border-[#343941] bg-[#090B0D] px-3 py-2.5 text-sm text-[#E6E8EB] placeholder:text-[#4F5863] outline-none focus:border-[#20B26B]";
  const labelCls = "block text-xs font-medium text-[#77808C] mb-1";
  const btnPrimary = "border border-[#20B26B] bg-[#20B26B] px-4 py-2.5 text-sm font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
  const btnSecondary = "border border-[#343941] px-4 py-2.5 text-sm font-medium text-[#B8C0CC] hover:text-[#E6E8EB] transition-colors";
  const btnBack = "text-sm text-[#77808C] hover:text-[#E6E8EB] transition-colors";
  const optionCardCls = "w-full border border-[#343941] bg-[#111315] p-4 text-left transition-colors hover:border-[#20B26B] hover:bg-[#15191D] group";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      <div className="relative border border-[#24282D] bg-[#0F1317] w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#24282D] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#E6E8EB]">
            {mode === "kind" &&
              (modalTitle ??
                (addMode === "watchlist"
                  ? "Add Card to Watchlist"
                  : addMode === "business"
                    ? "Add Card to Inventory"
                    : "Add Card to Collection"))}
            {mode === "select" &&
              (modalTitle ?? (addMode === "watchlist" ? "Add Card to Watchlist" : addMode === "business" ? "Add Card to Inventory" : "Add Card to Collection"))}
            {mode === "upload" && "Upload Card Photo"}
            {mode === "manual" && "Enter Card Details"}
            {mode === "confirm" && "Confirm Card"}
            {mode === "graded_company" && "Choose grading company"}
            {mode === "graded_cert" && "Add graded card (PSA)"}
            {mode === "graded_manual" && `Enter ${gradedCompany} card details`}
            {mode === "graded_confirm" && "Confirm graded card"}
          </h2>
          <button onClick={handleClose} className="px-2 text-xl leading-none text-[#77808C] hover:text-[#E6E8EB]">
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Error */}
          {error && (
            <div className="border border-[#723030] bg-[#2A1111] px-3 py-2">
              <p className="text-sm text-[#E05C5C]">{error}</p>
            </div>
          )}

          {/* Raw vs graded */}
          {mode === "kind" && (
            <div className="space-y-3">
              <p className="text-xs text-[#77808C]">Is this card graded (slabbed) or raw?</p>
              <button type="button" onClick={() => setMode("select")} className={optionCardCls}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border border-[#343941] bg-[#1E2227] flex items-center justify-center group-hover:border-[#20B26B] transition-colors">
                    <svg className="w-5 h-5 text-[#77808C] group-hover:text-[#20B26B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#E6E8EB]">Raw card</p>
                    <p className="text-xs text-[#77808C]">Upload a photo or find the card in the database</p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setGradedCertInput("");
                  setGradedCompany("PSA");
                  clearPsa();
                  setMode("graded_company");
                }}
                className={optionCardCls}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border border-[#1F5F45] bg-[#0E251B] flex items-center justify-center group-hover:bg-[#143624] transition-colors">
                    <svg className="w-5 h-5 text-[#20B26B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#E6E8EB]">Graded card</p>
                    <p className="text-xs text-[#77808C]">PSA, BGS, SGC, or CGC — pick the grading company next</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Graded: grading company picker */}
          {mode === "graded_company" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("kind");
                }}
                className={btnBack}
              >
                ← Back
              </button>
              <p className="text-xs text-[#77808C]">Which company graded this card?</p>
              {GRADING_COMPANIES.map((company) => (
                <button
                  key={company.value}
                  type="button"
                  onClick={() => {
                    setError(null);
                    setGradedCompany(company.value);
                    setGradedCertInput("");
                    clearPsa();
                    if (company.value === "PSA") {
                      setMode("graded_cert");
                    } else {
                      setGradedManualForm({
                        player_name: "",
                        year: "",
                        set_name: "",
                        card_number: "",
                        parallel_type: "",
                        grade: "",
                      });
                      setMode("graded_manual");
                    }
                  }}
                  className={optionCardCls}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#E6E8EB]">{company.label}</p>
                      <p className="text-xs text-[#77808C] mt-0.5">{company.description}</p>
                    </div>
                    {company.value === "PSA" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 border border-[#1F5F45] bg-[#0E251B] text-[#20B26B]">
                        Auto
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Select Mode */}
          {mode === "select" && (
            <div className="space-y-3">
              {showKindStep && (
                <button type="button" onClick={() => setMode("kind")} className={btnBack}>← Back</button>
              )}
              <button onClick={() => setMode("upload")} className={optionCardCls}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border border-[#1D3A60] bg-[#0A1929] flex items-center justify-center group-hover:bg-[#0E2240] transition-colors">
                    <svg className="w-5 h-5 text-[#60A0DC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#E6E8EB]">Upload Card Photo</p>
                    <p className="text-xs text-[#77808C]">AI identifies the card and estimates grade</p>
                  </div>
                </div>
              </button>
              {hasCardPicker && onOpenSmartSearch && (
                <button onClick={() => onOpenSmartSearch()} className={optionCardCls}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border border-[#343941] bg-[#1E2227] flex items-center justify-center group-hover:border-[#20B26B] transition-colors">
                      <svg className="w-5 h-5 text-[#77808C] group-hover:text-[#20B26B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#E6E8EB]">Find in Card Database</p>
                      <p className="text-xs text-[#77808C]">Use structured filters to pick the exact card</p>
                    </div>
                  </div>
                </button>
              )}
              <button onClick={() => setMode("manual")} className={optionCardCls}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 border border-[#343941] bg-[#1E2227] flex items-center justify-center group-hover:border-[#20B26B] transition-colors">
                    <svg className="w-5 h-5 text-[#77808C] group-hover:text-[#20B26B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#E6E8EB]">Enter Manually</p>
                    <p className="text-xs text-[#77808C]">Type the card details yourself — no search</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Graded: PSA cert entry */}
          {mode === "graded_cert" && (
            <div className="space-y-4">
              <button type="button" onClick={() => { setError(null); setMode("graded_company"); }} className={btnBack}>← Back</button>
              <div>
                <label className={labelCls}>PSA certification number</label>
                <input
                  type="text" inputMode="numeric" autoComplete="off"
                  value={gradedCertInput}
                  onChange={(e) => { const val = e.target.value; setGradedCertInput(val); if (psaResult || psaError) clearPsa(); lookupPsaCert(val); }}
                  onBlur={(e) => lookupPsaCertImmediate(e.target.value)}
                  placeholder="e.g., 12345678"
                  className={inputCls}
                />
                {psaLoading && (
                  <p className="mt-2 flex items-center gap-2 text-xs text-[#77808C]">
                    <span className="inline-block h-3.5 w-3.5 border border-[#343941] border-t-[#20B26B] rounded-full animate-spin" />
                    Looking up cert…
                  </p>
                )}
                {psaError && <p className="mt-2 text-xs text-[#E05C5C]">{psaError}</p>}
                {psaResult && !psaLoading && (
                  <p className="mt-2 text-xs text-[#20B26B]">Cert found — review details on the next step</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { if (!psaResult?.player_name) { setError("Enter a valid PSA cert number and wait for verification."); return; } setError(null); setMode("graded_confirm"); }}
                disabled={!psaResult?.player_name || psaLoading}
                className={`w-full ${btnPrimary}`}
              >
                Continue to confirm
              </button>
              {currentGradedCertDigits.length >= 5 && !psaLoading && (
                <button type="button" onClick={openGradedManualEntry} className={`w-full ${btnSecondary}`}>
                  Enter details manually
                </button>
              )}
            </div>
          )}

          {/* Graded: manual entry (BGS/SGC/CGC always; PSA fallback when lookup unavailable) */}
          {mode === "graded_manual" && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => { setError(null); setMode(gradedCompany === "PSA" ? "graded_cert" : "graded_company"); }}
                className={btnBack}
              >
                ← Back
              </button>
              <div className="border border-[#5A4A1F] bg-[#251E0E] px-3 py-2 text-xs text-[#F0B429]">
                {gradedCompany === "PSA"
                  ? "PSA lookup can enrich the card, but it is not required. Enter the slab details here and continue."
                  : `${gradedCompany} cert lookup isn't supported yet — enter the slab details from the label below.`}
              </div>
              <div>
                <label className={labelCls}>
                  {gradedCompany} certification number {gradedCompany === "PSA" ? "" : "(optional)"}
                </label>
                <input
                  type="text"
                  value={gradedCompany === "PSA" ? currentGradedCertDigits : gradedCertInput}
                  readOnly={gradedCompany === "PSA"}
                  onChange={
                    gradedCompany === "PSA"
                      ? undefined
                      : (e) => setGradedCertInput(e.target.value)
                  }
                  placeholder={gradedCompany === "PSA" ? undefined : "e.g., 1234567890"}
                  className={gradedCompany === "PSA" ? `${inputCls} opacity-50` : inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Player Name <span className="text-[#E05C5C]">*</span></label>
                <input type="text" value={gradedManualForm.player_name} onChange={(e) => setGradedManualForm((prev) => ({ ...prev, player_name: e.target.value }))} placeholder="e.g., Michael Jordan" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Year</label>
                  <input type="text" value={gradedManualForm.year} onChange={(e) => setGradedManualForm((prev) => ({ ...prev, year: e.target.value }))} placeholder="e.g., 1986" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Grade</label>
                  <input
                    type="text"
                    value={gradedManualForm.grade}
                    onChange={(e) => setGradedManualForm((prev) => ({ ...prev, grade: e.target.value }))}
                    placeholder={gradedCompany === "BGS" ? "e.g., 9.5" : "e.g., 10"}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Set / Brand</label>
                <input type="text" value={gradedManualForm.set_name} onChange={(e) => setGradedManualForm((prev) => ({ ...prev, set_name: e.target.value }))} placeholder="e.g., Topps Chrome" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Card #</label>
                  <input type="text" value={gradedManualForm.card_number} onChange={(e) => setGradedManualForm((prev) => ({ ...prev, card_number: e.target.value }))} placeholder="e.g., 57" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Parallel / Variant</label>
                  <input type="text" value={gradedManualForm.parallel_type} onChange={(e) => setGradedManualForm((prev) => ({ ...prev, parallel_type: e.target.value }))} placeholder="Optional" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Quantity</label>
                <input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inputCls} max-w-40`} />
              </div>
              <button type="button" onClick={handleGradedManualSubmit} className={`w-full ${btnPrimary}`}>
                {addMode === "business" ? "Continue to inventory details" : "Set purchase info & add to collection"}
              </button>
            </div>
          )}

          {/* Graded: confirm PSA details */}
          {mode === "graded_confirm" && psaResult && (
            <div className="space-y-4">
              <button type="button" onClick={() => setMode("graded_cert")} className={btnBack}>← Back</button>
              <div className="border border-[#24282D] bg-[#090B0D] p-4 space-y-2 text-sm">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">PSA registry</p>
                <p className="text-sm font-semibold text-[#E6E8EB]">{psaResult.player_name}</p>
                {psaResult.year && <p className="text-[#B8C0CC]"><span className="text-[#77808C]">Year:</span> {psaResult.year}</p>}
                {psaResult.set_name && <p className="text-[#B8C0CC]"><span className="text-[#77808C]">Set:</span> {psaResult.set_name}</p>}
                {psaResult.card_number && <p className="text-[#B8C0CC]"><span className="text-[#77808C]">Card #:</span> {psaResult.card_number}</p>}
                {psaResult.parallel_type && <p className="text-[#B8C0CC]"><span className="text-[#77808C]">Parallel:</span> {psaResult.parallel_type}</p>}
                {psaResult.grade && <p className="text-[#B8C0CC]"><span className="text-[#77808C]">Grade:</span> {psaResult.grade}</p>}
                <p className="text-[#B8C0CC]"><span className="text-[#77808C]">Cert #:</span> {gradedCertInput.replace(/\D/g, "") || "—"}</p>
              </div>
              <p className="text-xs text-[#77808C]">Confirm this matches your slab. If anything looks wrong, go back and double-check the cert number.</p>
              <div>
                <label className={labelCls}>Quantity</label>
                <input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inputCls} max-w-40`} />
              </div>
              <div className="flex gap-2 border-t border-[#24282D] pt-4">
                <button type="button" onClick={() => setMode("graded_cert")} className={`flex-1 ${btnSecondary}`}>Not the right card</button>
                <button type="button" onClick={addMode === "business" ? handleGradedInventoryConfirm : proceedGradedToCollectionConfirm} className={`flex-1 ${btnPrimary}`}>
                  {addMode === "business" ? "Continue to inventory details" : "Set purchase info & add"}
                </button>
              </div>
            </div>
          )}

          {/* Upload Mode */}
          {mode === "upload" && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <span className="inline-block h-8 w-8 border border-[#343941] border-t-[#20B26B] rounded-full animate-spin" />
                  <p className="text-sm text-[#77808C]">Processing card…</p>
                </div>
              ) : previews.length > 0 ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-3 flex-wrap justify-center">
                    {previews.map((preview, index) => (
                      <img key={`${preview}-${index}`} src={preview} alt={`Card preview ${index + 1}`} className="h-32 w-24 object-cover border border-[#24282D]" />
                    ))}
                  </div>
                  <p className="text-xs text-[#77808C]">{previews.length} photo{previews.length > 1 ? "s" : ""} selected</p>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <div className="border border-dashed border-[#343941] p-8 text-center hover:border-[#20B26B] transition-colors">
                    <svg className="w-10 h-10 text-[#4F5863] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium text-[#B8C0CC] mb-1">Drop your card photos here</p>
                    <p className="text-xs text-[#77808C]">or click to select (front + back)</p>
                  </div>
                  <input type="file" accept="image/*" multiple onChange={(e) => { const f = e.target.files; if (f && f.length > 0) handleFiles(f); }} className="hidden" />
                </label>
              )}
              <button onClick={() => setMode("select")} className={`w-full ${btnSecondary}`}>Back</button>
            </div>
          )}

          {/* Manual Mode */}
          {mode === "manual" && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Player Name <span className="text-[#E05C5C]">*</span></label>
                <input type="text" value={manualForm.player_name} onChange={(e) => setManualForm({ ...manualForm, player_name: e.target.value })} placeholder="e.g., Michael Jordan" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Year</label>
                <input type="text" value={manualForm.year} onChange={(e) => setManualForm({ ...manualForm, year: e.target.value })} placeholder="e.g., 1986" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Set / Brand</label>
                <input type="text" value={manualForm.set_name} onChange={(e) => setManualForm({ ...manualForm, set_name: e.target.value })} placeholder="e.g., Fleer, Panini Prizm" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Parallel / Variant</label>
                <input type="text" value={manualForm.parallel_type} onChange={(e) => setManualForm({ ...manualForm, parallel_type: e.target.value })} placeholder="e.g., Silver Prizm, Refractor" className={inputCls} />
              </div>
              <div className="flex gap-2 border-t border-[#24282D] pt-4">
                <button onClick={() => setMode("select")} className={`flex-1 ${btnSecondary}`}>Back</button>
                <button onClick={handleManualSubmit} className={`flex-1 ${btnPrimary}`}>Continue</button>
              </div>
            </div>
          )}

          {/* Confirm Mode */}
          {mode === "confirm" && identifiedCard && (
            <div className="space-y-4">
              <div className="flex gap-4">
                {collectionGradedCertDigits && !identifiedCard.imageUrl ? (
                  <div className="flex-shrink-0 w-20 h-28 border border-[#1F5F45] bg-[#0E251B] flex flex-col items-center justify-center p-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#20B26B]">PSA</span>
                    <span className="text-xs text-center font-mono text-[#20B26B] mt-1 break-all">{collectionGradedCertDigits}</span>
                  </div>
                ) : null}
                {identifiedCard.imageUrl && (
                  <div className="flex-shrink-0 space-y-2">
                    <img src={identifiedCard.imageUrl} alt={identifiedCard.player_name} className="w-20 h-28 object-cover border border-[#24282D] bg-[#111315]" />
                    {showingBestMatchInDatabase && <p className="text-[10px] text-[#F0B429]">Best match in database</p>}
                    {identifiedCard.imageUrls && identifiedCard.imageUrls.length > 1 && (
                      <div className="flex gap-1.5">
                        {identifiedCard.imageUrls.slice(1, 3).map((url, index) => (
                          <img key={`${url}-${index}`} src={url} alt={`${identifiedCard.player_name} alt ${index + 1}`} className="w-9 h-12 object-cover border border-[#24282D]" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#E6E8EB] truncate">{identifiedCard.player_name}</h3>
                  <div className="mt-1 space-y-0.5 text-xs text-[#B8C0CC]">
                    {showYear ? <p>Year: {identifiedCard.year}</p> : yearNeedsConfirmation ? (
                      <div className="flex items-center gap-2">
                        <p>Year: Needs confirmation</p>
                        <button type="button" onClick={() => setEditingYear(true)} className="text-[#20B26B] hover:text-[#33C47C]">Edit</button>
                      </div>
                    ) : null}
                    {editingYear && (
                      <div className="flex items-center gap-2">
                        <input type="text" value={yearDraft} onChange={(e) => setYearDraft(e.target.value)} placeholder="e.g., 2025" className="w-20 border border-[#343941] bg-[#090B0D] px-2 py-1 text-xs text-[#E6E8EB] outline-none focus:border-[#20B26B]" />
                        <button type="button" onClick={() => applyYearOverride(yearDraft)} className="text-xs text-[#20B26B]">Save</button>
                        <button type="button" onClick={() => { setEditingYear(false); setYearDraft(identifiedCard.year || ""); }} className="text-xs text-[#77808C]">Cancel</button>
                      </div>
                    )}
                    {(() => { const { setLabel } = formatSetLabel(identifiedCard.cardIdentity, identifiedCard.set_name, identifiedCard.parallel_type); return setLabel ? <p>Set: {setLabel}</p> : null; })()}
                    {identifiedCard.cardIdentity?.parallel && identifiedCard.cardIdentity.parallel !== "Base" && <p>Parallel: {identifiedCard.cardIdentity.parallel}</p>}
                  </div>
                </div>
              </div>

              {identifiedCard.cardIdentity?.warnings?.includes("parse_error") && (
                <div className="border border-[#5A4A1F] bg-[#251E0E] px-3 py-2 text-xs text-[#F0B429]">
                  We couldn’t read all card details. Please confirm the year and set below.
                </div>
              )}

              {addMode !== "watchlist" && (
                <div className="border-t border-[#24282D] pt-4">
                  <label className={labelCls}>Quantity</label>
                  <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inputCls} max-w-40`} />
                </div>
              )}

              {addMode === "collection" && (
                <div className="space-y-4 border-t border-[#24282D] pt-4">
                  <div>
                    <label className={labelCls}>Acquisition Type</label>
                    <select value={acquisitionType} onChange={(e) => { const t = e.target.value as AcquisitionType; setAcquisitionType(t); if (t === "pulled") setPurchasePrice(""); }} className={inputCls}>
                      <option value="pulled">Pulled</option>
                      <option value="bought">Bought</option>
                      <option value="trade">Trade</option>
                      <option value="gift">Gift</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                  {acquisitionType !== "pulled" && (
                    <div>
                      <label className={labelCls}>Purchase Price</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#77808C]">$</span>
                        <input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="0.00" min="0" step="0.01" className={`${inputCls} pl-7`} />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Purchase Date (Optional)</label>
                    <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Condition</label>
                    <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputCls}>
                      {CONDITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-2 border-t border-[#24282D] pt-4">
                <button
                  onClick={() => { if (addMode === "collection" && collectionGradedCertDigits) { setIdentifiedCard(null); setCollectionGradedCertDigits(null); setPreviews([]); setMode("graded_confirm"); return; } setIdentifiedCard(null); setCollectionGradedCertDigits(null); setPreviews([]); setMode("select"); }}
                  disabled={loading}
                  className={`flex-1 ${btnSecondary}`}
                >
                  Back
                </button>
                <button onClick={handleConfirm} disabled={loading} className={`flex-1 ${btnPrimary}`}>
                  {loading ? "Adding…" : addMode === "watchlist" ? "Continue to Set Target Price" : addMode === "business" ? "Continue to Inventory Details" : "Add to Collection"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
