/**
 * PSA Public API client
 * Auth: Bearer token via PSA_ACCESS_TOKEN env var
 * Docs: https://api.psacard.com/publicapi/swagger/ui/index
 */

const PSA_BASE = "https://api.psacard.com/publicapi";

function getToken(): string {
  const token = process.env.PSA_ACCESS_TOKEN;
  if (!token) throw new Error("PSA_ACCESS_TOKEN is not configured");
  return token;
}

function authHeaders() {
  return {
    Authorization: `bearer ${getToken()}`,
    Accept: "application/json",
  };
}

export interface PSACert {
  CertNumber: string;
  SpecNumber: string;
  LabelType: string;
  Year: string;
  Brand: string;        // set/brand name
  Category: string;
  CardNumber: string;
  Subject: string;      // player / card subject
  Variety: string;
  GradeDescription: string;
  CardGrade: string;    // numeric grade as string e.g. "9", "9.5"
  IsDualCert: boolean;
  IsPSADNA: boolean;
  ItemStatus: string;
  TotalPopulation: number;
  PopulationHigher: number;
}

export interface PSAImage {
  IsFrontImage: boolean;
  ImageURL: string;
}

export interface PSACertResult {
  cert: PSACert;
  /** Primary (front) image URL, if available */
  imageUrl: string | null;
  /** All image URLs returned by PSA */
  allImages: PSAImage[];
}

/**
 * Look up a PSA cert by cert number.
 * Returns cert details + images in a single call.
 */
export async function getPSACert(certNumber: string): Promise<PSACertResult> {
  const clean = certNumber.trim().replace(/\D/g, "");
  if (!clean) throw new Error("Invalid cert number");

  const [certRes, imgRes] = await Promise.allSettled([
    fetch(`${PSA_BASE}/cert/GetByCertNumber/${encodeURIComponent(clean)}`, {
      headers: authHeaders(),
      next: { revalidate: 0 },
    }),
    fetch(`${PSA_BASE}/cert/GetImagesByCertNumber/${encodeURIComponent(clean)}`, {
      headers: authHeaders(),
      next: { revalidate: 0 },
    }),
  ]);

  // Cert data is required
  if (certRes.status === "rejected" || !certRes.value.ok) {
    const status = certRes.status === "fulfilled" ? certRes.value.status : 0;
    if (status === 401 || status === 403) throw new Error("PSA API auth failed — check PSA_ACCESS_TOKEN");
    if (status === 404) throw new Error(`Cert ${clean} not found in PSA database`);
    throw new Error(`PSA API error (${status})`);
  }

  const certJson = await certRes.value.json();
  // PSA wraps response in PSACert key
  const cert: PSACert = certJson?.PSACert ?? certJson;
  if (!cert?.CertNumber) throw new Error(`Cert ${clean} not found in PSA database`);

  // Images are optional — don't fail if unavailable
  let allImages: PSAImage[] = [];
  if (imgRes.status === "fulfilled" && imgRes.value.ok) {
    const imgJson = await imgRes.value.json();
    // Response may be an array or wrapped object
    allImages = Array.isArray(imgJson) ? imgJson : (imgJson?.PSAImages ?? imgJson?.images ?? []);
  }

  // Prefer front image; fall back to first available
  const front = allImages.find((i) => i.IsFrontImage) ?? allImages[0] ?? null;
  const imageUrl = front?.ImageURL ?? null;

  return { cert, imageUrl, allImages };
}

/**
 * Normalize a PSACert into a PendingInventoryCard-compatible shape
 */
export function normalizePSACert(result: PSACertResult) {
  const { cert, imageUrl } = result;
  return {
    cert_number: cert.CertNumber,
    player_name: cert.Subject || cert.Category || "Unknown",
    year: cert.Year || undefined,
    set_name: cert.Brand || undefined,
    card_number: cert.CardNumber || undefined,
    parallel_type: cert.Variety || undefined,
    grader: "PSA",
    grade: cert.CardGrade || undefined,
    imageUrl: imageUrl ?? undefined,
    stock_image_url: imageUrl ?? undefined,
    // PSA-specific extras for display
    grade_description: cert.GradeDescription,
    population: cert.TotalPopulation,
    population_higher: cert.PopulationHigher,
  };
}
