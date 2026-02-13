import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { extractCardIdentityDetailed, type ImageInput } from "@/lib/card-identity";
import {
  resolveGradeEstimateImages,
  type ResolvedGradeEstimateImage,
} from "@/lib/grading/gradeEstimateImages";
import { parseGradeEstimateModelOutput } from "@/lib/grading/gradeEstimateModel";
import type { GradeEstimateJobDependencies } from "@/lib/grading/gradeEstimateJob";
import type { GradeEstimate } from "@/types";
import {
  fetchGradeCmv,
  computeWorthGrading,
  normalizeProbabilities,
  type GradeEstimatorCardInput,
} from "@/lib/grade-estimator/value";
import { DEFAULT_COMPS_WINDOW_DAYS } from "@/lib/grade-estimator/constants";

const SYSTEM_PROMPT = `You are a professional sports trading card grading expert who reasons exactly like a PSA, BGS, SGC, or CGC grader. You do not merely detect defects — you evaluate their type, severity, quantity, location, and cumulative impact on grade probability, on BOTH the front AND back of the card. You think like a grader, not a classifier.`;

const USER_PROMPT = `Analyze these photos of the SAME sports trading card and estimate its condition/grade. The card is RAW (not already in a slab).

CRITICAL — FRONT AND BACK EVALUATION:
The images may include BOTH the front and back of the card. You MUST evaluate EVERY image provided. Defects found on ANY side (front OR back) MUST factor into the final grade estimate and probabilities. A card with a perfect front but a damaged back is NOT a high-grade card. Grading companies inspect both sides equally — you must do the same.

You may receive multiple angles or lighting variations. Use all photos together and prioritize the clearest details.

═══════════════════════════════════════════
DEFECT SEVERITY CLASSIFICATION FRAMEWORK
═══════════════════════════════════════════

For EVERY defect you identify, classify its severity:

  MINOR    — Barely visible, requires close inspection. Unlikely to dominate grade outcome alone.
  MODERATE — Clearly visible at normal viewing distance. Definitively grade-impacting.
  MAJOR    — Immediately obvious. Grade-limiting — creates a ceiling on the achievable grade.

Severity classification must consider:
  • Type of defect (what it is)
  • Severity (how bad it is)
  • Quantity (how many instances)
  • Location (where on the card — front vs back, corner vs center)

Include severity labels in your evidence descriptions (e.g., "Minor whitening on back bottom-left corner", "Moderate scratch across front surface").

═══════════════════════════════════════════
INSPECTION AREAS
═══════════════════════════════════════════

1. CENTERING (use the front of the card)
   Estimate border ratios on both axes:
   - Left/Right and Top/Bottom (e.g., "50/50", "55/45", "60/40")

   Centering severity bands — avoid binary logic, use smooth reasoning:
   - Near-perfect (50/50 to 52/48): Minimal impact. PSA 10 still viable.
   - Slight deviation (53/47 to 55/45): PSA 10 probability reduced, PSA 9 favored.
   - Noticeable deviation (56/44 to 60/40): PSA 9 becomes ceiling, PSA 8 probability rises.
   - Poor centering (worse than 60/40): PSA 8 ceiling behavior. Strongly favors PSA 7 or lower.

2. CORNERS — Examine all four corners on BOTH FRONT AND BACK.
   Look for: whitening, wear, dings, fraying, softness, chipping at corner tips.
   Note which side (front/back) and which corner each defect appears on.

   Corner severity reasoning:
   - Minor whitening on 1 corner: Small PSA 10 reduction. PSA 9 still likely.
   - Moderate whitening on 1 corner: PSA 10 unlikely. PSA 9 favored.
   - Moderate whitening on 2+ corners: PSA 9 suppressed. PSA 8 favored.
   - Major whitening or damage on any corner: PSA 8 ceiling or lower.

   Quantity matters: a single minor corner defect is NOT equal to multiple moderate corners. Multiple minor corner defects compound toward a moderate-level impact.

3. SURFACE — Inspect the surface on BOTH FRONT AND BACK.
   Differentiate between these distinct defect types:
   - Print lines (factory manufacturing lines)
   - Scratches (linear surface damage)
   - Scuffs (area surface abrasion)
   - Indentations or dents (physical depressions)
   - Staining or discoloration
   - Fingerprints or smudges
   - Ink spots or ink transfer

   Surface severity reasoning:
   - Minor print line: Moderate PSA 10 penalty (print lines are common but noticed by graders).
   - Minor scratch or scuff: Moderate penalty. PSA 10 unlikely.
   - Visible scratch: Major penalty. PSA 9 suppressed.
   - Deep surface damage, indentation, or heavy staining: Grade ceiling behavior — PSA 8 or lower.

   Note which side (front/back) each defect appears on.

4. EDGES — Examine all four edges on BOTH FRONT AND BACK.
   Look for: chipping, rough cuts, uneven edges, whitening, wear.
   Note which side (front/back) each defect appears on.

   Edge severity reasoning:
   - Minor edge touch or faint whitening: Mild high-grade penalty. PSA 10 slightly reduced.
   - Moderate chipping or visible whitening: PSA 9 suppressed. PSA 8 favored.
   - Major chipping or heavy wear: Strong PSA 8 or lower bias. Grade ceiling behavior.

   Multiple edge defects compound impact — two minor edge issues approximate one moderate issue.

5. BACK-SPECIFIC DEFECTS (if a back image is provided):
   - Whitening along edges or corners on the back
   - Chipping visible on the back surface or edges
   - Scratches, scuffs, or surface wear on the back
   - Print defects (misalignment, ink blots, print lines)
   - Wax stains or adhesive residue
   - Any damage not visible from the front
   - If no back image is provided, state "No back image provided" and note this limits confidence.

   Back defects carry EQUAL severity weight to front defects. Apply the same severity framework.

═══════════════════════════════════════════
CUMULATIVE / COMPOUNDING LOGIC
═══════════════════════════════════════════

Defects are NOT isolated. You must reason about their cumulative impact:

  • Multiple MINOR defects across different areas (e.g., minor corner whitening + minor edge touch + faint print line) compound to approximate a MODERATE overall impact. PSA 10 becomes unlikely.
  • MINOR + MODERATE defects together create a strong penalty. PSA 9 becomes ceiling.
  • Multiple MODERATE defects across areas create MAJOR-grade suppression. PSA 8 or lower favored.
  • Any single MAJOR defect creates a hard grade ceiling regardless of how clean the rest of the card is.

Avoid treating each sub-grade area as a separate, independent evaluation. The FINAL probability distribution must reflect the combined weight of ALL defects found across ALL areas on BOTH sides.

═══════════════════════════════════════════
PROBABILITY DISTRIBUTION BEHAVIOR
═══════════════════════════════════════════

Your severity assessments must shape the probability distribution smoothly:

  • PSA 10 suppression: Any confirmed defect (even minor) should begin reducing PSA 10 probability. Multiple minor defects should bring PSA 10 well below 0.10. A single moderate defect should bring PSA 10 near 0.0.
  • PSA 9 vs PSA 8 shifts: Moderate defects shift weight from PSA 9 toward PSA 8. Major defects shift weight past PSA 8 into PSA 7 or lower.
  • Grade ceiling behavior: When a major defect is identified, most probability mass should sit AT or BELOW the ceiling grade. Do not spread probability above the ceiling.
  • Smooth transitions: Avoid abrupt probability jumps. A slightly-worse-than-minor defect should NOT cause PSA 10 to jump from 0.30 to 0.0. Use gradual curves.

═══════════════════════════════════════════
GRADE SCALE REFERENCE
═══════════════════════════════════════════

- 10 = Gem Mint (virtually perfect on BOTH sides — no defects at any severity)
- 9 = Mint (one minor flaw allowed on corners, centering, or surface, on either side)
- 8 = NM-MT (one or two moderate flaws, or several minor flaws, on either side)
- 7 = NM (multiple moderate flaws or a major flaw, on either side)
- 6 = EX-MT (visible wear across multiple areas)

═══════════════════════════════════════════
CONFIDENCE LOGIC
═══════════════════════════════════════════

Confidence must reflect your diagnostic certainty, not just whether you detected defects:

  • Set "low_confidence" when:
    - Image is blurry, low-resolution, or poorly lit
    - Card is partially obscured or cropped
    - Only front images are provided (no back)
    - Surface texture or defects are ambiguous
    - You cannot distinguish between a defect and a photo artifact

  • When confidence is low, shift probabilities conservatively (more weight on lower grades) and note the specific limitation.

═══════════════════════════════════════════
IMPORTANT REMINDERS
═══════════════════════════════════════════

- Be conservative — it is better to underestimate than overestimate
- Defects on the BACK are just as grade-limiting as defects on the FRONT
- A single significant back defect (edge chipping, corner whitening, scratches) lowers the grade the same way a front defect would
- Photo quality affects accuracy — note if image quality limits your assessment
- If only front images are provided, note reduced confidence and lean conservative
- Give a range (e.g., 7-9) to reflect uncertainty
- Think like a professional grader: evaluate severity, not just presence

Return ONLY valid JSON with this structure (no prose):
{
  "status": "ok" | "low_confidence" | "unable",
  "reason": "short reason",
  "estimated_grade_low": 0,
  "estimated_grade_high": 0,
  "centering": "",
  "corners": "",
  "surface": "",
  "edges": "",
  "grade_notes": "",
  "probabilities": [
    { "label": "PSA 10", "probability": 0.0 },
    { "label": "PSA 9", "probability": 0.0 },
    { "label": "PSA 8", "probability": 0.0 },
    { "label": "PSA 7 or lower", "probability": 0.0 }
  ],
  "bgs_probabilities": [
    { "label": "BGS 9.5", "probability": 0.0 },
    { "label": "BGS 9", "probability": 0.0 },
    { "label": "BGS 8.5", "probability": 0.0 },
    { "label": "BGS 8 or lower", "probability": 0.0 }
  ]
}

Rules:
- Always include status, reason, and both probability arrays.
- Probabilities must sum to 1.0 in each array.
- If low_confidence or unable, still return conservative probabilities with more weight on lower grades.
- The "corners", "surface", and "edges" fields MUST include severity labels (minor/moderate/major) for each defect found and MUST mention back-side findings when a back image is present.
- "grade_notes" MUST: (1) state whether both sides were evaluated, (2) list the single most grade-limiting defect with its severity, (3) note any compounding effects from multiple defects, and (4) explain the reasoning behind the probability distribution.
`;

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

async function runGradeModel(
  images: ResolvedGradeEstimateImage[]
): Promise<string | null> {
  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: image.mediaType,
              data: image.base64Image,
            },
          })),
          {
            type: "text",
            text: USER_PROMPT,
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const textContent = message.content.find((c) => c.type === "text");
  return textContent && textContent.type === "text" ? textContent.text : null;
}

async function runOcrIdentity(images: ResolvedGradeEstimateImage[]) {
  const inputs: ImageInput[] = images.map((image) => ({
    data: image.base64Image,
    mediaType: image.mediaType,
    source: image.source,
  }));
  const { cardIdentity } = await extractCardIdentityDetailed(inputs);
  return cardIdentity;
}

async function runPostGradingValue(options: {
  card: GradeEstimatorCardInput;
  gradeEstimate: GradeEstimate;
}) {
  const probabilities = normalizeProbabilities(
    options.gradeEstimate.grade_probabilities!
  );
  const windowDays = DEFAULT_COMPS_WINDOW_DAYS;

  const [raw, psa10, psa9, psa8, bgs95, bgs9, bgs85] = await Promise.all([
    fetchGradeCmv(options.card, "raw", windowDays),
    fetchGradeCmv(options.card, "psa10", windowDays),
    fetchGradeCmv(options.card, "psa9", windowDays),
    fetchGradeCmv(options.card, "psa8", windowDays),
    fetchGradeCmv(options.card, "bgs95", windowDays),
    fetchGradeCmv(options.card, "bgs9", windowDays),
    fetchGradeCmv(options.card, "bgs85", windowDays),
  ]);

  return computeWorthGrading(
    raw,
    { "10": psa10, "9": psa9, "8": psa8 },
    { "9.5": bgs95, "9": bgs9, "8.5": bgs85 },
    probabilities,
    options.gradeEstimate.grade_probabilities?.confidence ?? "medium"
  );
}

export function createGradeEstimateJobDependencies(): GradeEstimateJobDependencies {
  return {
    resolveImages: resolveGradeEstimateImages,
    runOcrIdentity,
    runGradeModel,
    parseModelOutput: async (options) => parseGradeEstimateModelOutput(options),
    runPostGradingValue,
  };
}
