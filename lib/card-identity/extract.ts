import Anthropic from "@anthropic-ai/sdk";
import type {
  ExtractedCardIdentity,
  ImageInput,
  OcrLine,
  OcrSignals,
  VisionSignals,
  FieldConfidence,
} from "./types";
import { buildCardIdentityFromSignals, buildOcrSignals } from "./normalize";
import { parseFirstJsonObject } from "./json";
import { createBottomCrop } from "./image";

const VISION_MODEL = "claude-sonnet-4-20250514";

const OCR_SYSTEM_PROMPT =
  "You are a careful OCR system. Transcribe text exactly as seen. Do not infer or guess.";

const OCR_USER_PROMPT = `Extract all visible text from these card images.
Return ONLY JSON with this structure:
{
  "lines": [
    {"text": "...", "imageIndex": 0, "side": "front" | "back" | "unknown"}
  ]
}
Rules:
- Preserve the text as-is; do not correct spelling.
- If you are unsure, still include the line but keep it minimal.
- If no text is visible, return {"lines": []}.
`;

const VISION_SYSTEM_PROMPT =
  "You are a sports trading card identification expert. Be conservative and never guess a year.";

const VISION_USER_PROMPT = `Identify the card metadata from these images.
Return ONLY valid JSON with this structure:
{
  "player": null | string,
  "players": string[],
  "brand": null | string,
  "setName": null | string,
  "subset": null | string,
  "sport": null | string,
  "league": null | string,
  "year": null | number,
  "cardNumber": null | string,
  "rookie": null | boolean,
  "parallel": null | string,
  "insert": null | string,
  "grade": null | string,
  "confidence": "high" | "medium" | "low",
  "fieldConfidence": {
    "player": "high" | "medium" | "low",
    "brand": "high" | "medium" | "low",
    "setName": "high" | "medium" | "low",
    "subset": "high" | "medium" | "low",
    "sport": "high" | "medium" | "low",
    "league": "high" | "medium" | "low",
    "year": "high" | "medium" | "low",
    "cardNumber": "high" | "medium" | "low",
    "rookie": "high" | "medium" | "low",
    "parallel": "high" | "medium" | "low",
    "insert": "high" | "medium" | "low",
    "grade": "high" | "medium" | "low"
  },
  "fieldsReasoning": {
    "player": string,
    "brand": string,
    "setName": string,
    "subset": string,
    "sport": string,
    "league": string,
    "year": string,
    "cardNumber": string,
    "rookie": string,
    "parallel": string,
    "insert": string,
    "grade": string
  },
  "warnings": string[]
}
Requirements:
- Year must be an integer or null. Never guess. Only output a year when it is visible on the card.
- If any field is uncertain, set its confidence to low and add a warning.
- If you cannot determine the year, set year=null and add a warning about year uncertainty.
`;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function buildImageContent(images: ImageInput[]) {
  return images.map((image) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: image.mediaType,
      data: image.data,
    },
  }));
}

async function buildOcrImages(images: ImageInput[]): Promise<ImageInput[]> {
  const ocrImages: ImageInput[] = [...images];
  for (const image of images) {
    const crop = await createBottomCrop(image, 0.25);
    if (crop) {
      ocrImages.push(crop);
    }
  }
  return ocrImages;
}

function normalizeConfidence(value: unknown): FieldConfidence {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function normalizeVisionSignals(raw: unknown): VisionSignals {
  if (!raw || typeof raw !== "object") return {};
  const payload = raw as Record<string, unknown>;
  const confidence = normalizeConfidence(payload.confidence);
  const fieldConfidenceRaw = (payload.fieldConfidence ?? payload.fieldsConfidence ?? {}) as Record<string, unknown>;
  const fieldConfidence: Record<string, FieldConfidence> = {};
  for (const [key, value] of Object.entries(fieldConfidenceRaw)) {
    fieldConfidence[key] = normalizeConfidence(value);
  }

  const players = Array.isArray(payload.players)
    ? payload.players.filter((p) => typeof p === "string")
    : [];

  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.filter((w) => typeof w === "string")
    : [];

  return {
    player: typeof payload.player === "string" ? payload.player : null,
    players,
    brand: typeof payload.brand === "string" ? payload.brand : null,
    setName: typeof payload.setName === "string" ? payload.setName : null,
    subset: typeof payload.subset === "string" ? payload.subset : null,
    sport: typeof payload.sport === "string" ? payload.sport : null,
    league: typeof payload.league === "string" ? payload.league : null,
    year: typeof payload.year === "number" ? payload.year : null,
    cardNumber: typeof payload.cardNumber === "string" ? payload.cardNumber : null,
    rookie: typeof payload.rookie === "boolean" ? payload.rookie : null,
    parallel: typeof payload.parallel === "string" ? payload.parallel : null,
    insert: typeof payload.insert === "string" ? payload.insert : null,
    grade: typeof payload.grade === "string" ? payload.grade : null,
    confidence,
    fieldConfidence,
    fieldsConfidence: fieldConfidence,
    fieldsReasoning:
      payload.fieldsReasoning && typeof payload.fieldsReasoning === "object"
        ? (payload.fieldsReasoning as Record<string, string>)
        : null,
    warnings,
  };
}

async function runOcrPass(images: ImageInput[]): Promise<OcrSignals> {
  const client = getAnthropicClient();
  if (!client) {
    return buildOcrSignals([]);
  }

  const message = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    system: OCR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...buildImageContent(images),
          { type: "text", text: OCR_USER_PROMPT },
        ],
      },
    ],
  });

  const textContent = message.content.find((c) => c.type === "text");
  const rawText = textContent && textContent.type === "text" ? textContent.text : "";
  const parsedResult = parseFirstJsonObject(rawText);
  const parsed = parsedResult.value;
  const lines = Array.isArray((parsed as { lines?: OcrLine[] })?.lines)
    ? (parsed as { lines: OcrLine[] }).lines.filter((line) => typeof line?.text === "string")
    : rawText
        .split(/\n+/)
        .map((line) => ({ text: line.trim() }))
        .filter((line) => line.text);

  return buildOcrSignals(lines.map((line) => ({ text: line.text })));
}

async function runVisionPass(images: ImageInput[]): Promise<VisionSignals> {
  const client = getAnthropicClient();
  if (!client) {
    return {};
  }

  const message = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 2048,
    system: VISION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...buildImageContent(images),
          { type: "text", text: VISION_USER_PROMPT },
        ],
      },
    ],
  });

  const textContent = message.content.find((c) => c.type === "text");
  const rawText = textContent && textContent.type === "text" ? textContent.text : "";
  const parsedResult = parseFirstJsonObject(rawText);
  if (!parsedResult.value) {
    return {
      confidence: "low",
      fieldConfidence: { year: "low" },
      warnings: ["parse_error"],
    };
  }
  return normalizeVisionSignals(parsedResult.value);
}

export async function extractCardIdentityDetailed(
  images: ImageInput[]
): Promise<ExtractedCardIdentity> {
  if (!images.length) {
    return {
      cardIdentity: {
        player: null,
        year: null,
        brand: null,
        setName: null,
        subset: null,
        sport: null,
        league: null,
        cardNumber: null,
        rookie: null,
        parallel: null,
        cardStock: "unknown",
        confidence: "low",
        fieldConfidence: { year: "low", player: "low" },
        sources: {},
        warnings: ["no_images"],
        evidenceSummary: "No images provided.",
      },
      ocr: buildOcrSignals([]),
      vision: {},
    };
  }

  const ocrImages = await buildOcrImages(images);

  const [ocr, vision] = await Promise.all([
    runOcrPass(ocrImages).catch(() => buildOcrSignals([])),
    runVisionPass(images).catch(() => ({})),
  ]);

  const hasParseError = "warnings" in vision && vision.warnings?.includes("parse_error");
  if (hasParseError) {
    return {
      cardIdentity: {
        player: null,
        year: null,
        brand: null,
        setName: null,
        subset: null,
        sport: null,
        league: null,
        cardNumber: null,
        rookie: null,
        parallel: null,
        cardStock: "unknown",
        confidence: "low",
        fieldConfidence: { year: "low", player: "low" },
        sources: {},
        warnings: ["parse_error"],
        evidenceSummary: "Model output could not be parsed. Please confirm details.",
      },
      ocr,
      vision,
    };
  }

  const cardIdentity = buildCardIdentityFromSignals(ocr, vision);

  return { cardIdentity, ocr, vision };
}

export async function extractCardIdentity(images: ImageInput[]) {
  const result = await extractCardIdentityDetailed(images);
  return result.cardIdentity;
}
