export type FieldConfidence = "high" | "medium" | "low";
export type FieldSource = "ocr" | "vision" | "user" | "catalog" | "inferred";

export type CardIdentity = {
  player: string | null;
  year: number | null;
  brand: string | null; // e.g., Panini, Topps, Upper Deck
  setName: string | null; // e.g., Mosaic, Prizm, Donruss Optic, Bowman Chrome
  subset: string | null; // e.g., Base, Silver Prizm, Green Mosaic, Purple Prizm
  sport: string | null; // e.g., Football, Basketball, Baseball, Hockey, Soccer
  league: string | null; // e.g., NFL, NBA, MLB, NHL, NCAA, UEFA
  cardNumber: string | null;
  rookie: boolean | null;
  parallel: string | null;
  cardStock: "paper" | "chromium" | "unknown";
  confidence: FieldConfidence;
  fieldConfidence: Record<string, FieldConfidence>;
  sources: Record<string, FieldSource>;
  warnings: string[];
  evidenceSummary: string | null;
};

export type ImageInput = {
  data: string; // base64 (no data URL prefix)
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  source?: "url" | "base64";
  hint?: string;
};

export type OcrLine = {
  text: string;
  imageIndex?: number;
  side?: "front" | "back" | "unknown";
};

export type OcrYearCandidate = {
  year: number;
  score: number;
  line: string;
};

export type OcrSignals = {
  lines: OcrLine[];
  rawText: string;
  yearCandidates: OcrYearCandidate[];
  brand?: string;
  setName?: string;
  player?: string;
  playerCandidates?: string[];
  playerConfidence?: FieldConfidence;
};

export type VisionSignals = {
  player?: string | null;
  players?: string[] | null;
  brand?: string | null;
  setName?: string | null;
  subset?: string | null;
  sport?: string | null;
  league?: string | null;
  year?: number | null;
  cardNumber?: string | null;
  rookie?: boolean | null;
  parallel?: string | null;
  insert?: string | null;
  grade?: string | null;
  confidence?: FieldConfidence | null;
  fieldConfidence?: Record<string, FieldConfidence> | null;
  fieldsConfidence?: Record<string, FieldConfidence> | null; // legacy alias
  fieldsReasoning?: Record<string, string> | null;
  warnings?: string[] | null;
};

export type ExtractedCardIdentity = {
  cardIdentity: CardIdentity;
  ocr: OcrSignals;
  vision: VisionSignals;
};
