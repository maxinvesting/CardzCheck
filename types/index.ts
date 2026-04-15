export interface User {
  id: string;
  email: string;
  name?: string | null; // User's display name
  business_name?: string | null; // Optional business display name for business workspace
  ebay_store_url?: string | null; // Optional eBay store URL for Sales Channels shortcut
  app_role?: "member" | "admin" | "owner" | null; // App-level role for owner/admin access
  // eBay OAuth connection (connected_username only — tokens never exposed client-side)
  ebay_oauth_connected_username?: string | null;
  ebay_fee_rate?: "standard" | "top_rated_plus" | null;
  website_url?: string | null;
  ebay_last_inventory_sync?: string | null;
  ebay_last_sales_sync?: string | null;
  is_paid: boolean;
  stripe_customer_id: string | null;
  free_searches_used: number;
  analyst_queries_used?: number; // Number of AI analyst queries used (Pro feature, limit 100)
  created_at: string;
  plan_selected?: boolean; // Whether user has selected a plan (prevents modal from showing again)
  subscription?: Subscription; // New subscription record
  usage?: Usage; // New usage tracking record
}

// Subscription record for tier management
export interface Subscription {
  id: string;
  user_id: string;
  tier: "free" | "pro" | "business";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  activation_paid: boolean;
  current_period_end: string | null;
  status: "active" | "past_due" | "canceled" | "unpaid";
  created_at: string;
  updated_at: string;
}

export type BusinessRole = "owner" | "manager" | "employee";

export interface BusinessAccount {
  id: string;
  owner_user_id: string;
  name: string | null;
  appearance_primary_color?: string | null;
  appearance_secondary_color?: string | null;
  appearance_tertiary_color?: string | null;
  billing_interval: "monthly";
  subscription_status: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  seats_included: number;
  seat_quantity: number;
  purchased_seats: number;
  appearance_primary_color?: string | null;
  appearance_secondary_color?: string | null;
  appearance_tertiary_color?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessAppearance {
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
}

export interface BusinessMembership {
  id: string;
  business_account_id: string;
  user_id: string;
  role: BusinessRole;
  status: "active" | "inactive";
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessInvite {
  id: string;
  business_account_id: string;
  email: string;
  email_normalized: string;
  role: Exclude<BusinessRole, "owner">;
  token_hash: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessSeatSummary {
  seatsIncluded: number;
  seatQuantity: number;
  purchasedSeats: number;
  activeMembers: number;
  pendingInvites: number;
  usedSeats: number;
  reservedSeats: number;
  availableSeats: number;
}

export interface BusinessContext {
  businessAccountId: string;
  membershipId: string;
  role: BusinessRole;
  ownerUserId: string;
  accountName: string | null;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionItemId: string | null;
  seats: BusinessSeatSummary;
  permissions: {
    canAccessBusiness: boolean;
    canManageOperations: boolean;
    canManageTeam: boolean;
    canManageBilling: boolean;
    canInviteMembers: boolean;
    canManageSeats: boolean;
    canChangeMemberRoles: boolean;
    canRemoveMembers: boolean;
  };
}

// Business inventory item
export interface BusinessInventoryItem {
  id: string;
  user_id: string;
  business_account_id: string;
  card_id: string | null;
  title: string;
  quantity: number;
  acquisition_date: string | null;
  acquisition_type: "buy" | "trade" | "rip" | "consignment" | "other";
  cost_basis_total_cents: number;
  tax_cents: number;
  shipping_cents: number;
  fees_paid_cents: number;
  condition_status: "raw" | "graded";
  grading_company: string | null;
  grade: string | null;
  cert_number: string | null;
  psa_cert_number?: string | null;
  location: string | null;
  channel: "ebay" | "whatnot" | "instagram" | "show" | "local" | "other";
  status: "unlisted" | "listed" | "pending_sale" | "sold" | "returned";
  list_price_cents: number | null;
  current_market_value_cents: number | null;
  image_source?: CardImageSource | null;
  image_url?: string | null;
  trusted_image?: TrustedCardImage | null;
  user_image_url: string | null;
  stock_image_url?: string | null;
  ebay_image_url?: string | null;
  notes: string | null;
  ebay_item_id?: string | null; // eBay listing item ID for synced items
  ebay_listing_url?: string | null; // Direct eBay listing URL
  item_kind?: "owned" | "inventory" | null; // Ownership type
  created_at: string;
  updated_at: string;
}

// Business sale record
export interface BusinessSale {
  id: string;
  user_id: string;
  business_id: string;
  business_account_id: string;
  inventory_item_id: string | null;
  channel: "ebay" | "whatnot" | "instagram" | "show" | "local" | "other";
  sold_at: string;
  sold_price_cents: number;
  platform_fees_cents: number;
  shipping_charged_cents: number;
  shipping_cost_cents: number;
  tax_cents: number;
  net_payout_cents: number;
  cogs_cents: number;
  gross_revenue_cents: number;
  profit_cents: number;
  external_order_id: string | null;
  notes: string | null;
  is_deleted: boolean;
  inventory_item?: {
    id: string;
    title: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessMetrics {
  revenueMtd: number;
  revenueYtd: number;
  profitMtd: number;
  profitYtd: number;
  salesCountMtd: number;
  salesCountYtd: number;
  activeInventoryCount: number;
}

// Usage tracking for free tier limits
export interface Usage {
  id: string;
  user_id: string;
  searches_used: number;
  ai_messages_used: number;
  period_start: string;
  last_reset: string;
}

// Price history entry for watchlist
export interface PriceHistoryEntry {
  price: number;
  date: string;
}

// Watchlist item for tracking cards user wants to watch
export interface WatchlistItem {
  id: string;
  user_id: string;
  player_name: string;
  year: string | null;
  set_brand: string | null;
  card_number: string | null;
  parallel_variant: string | null;
  condition: string | null;
  target_price: number | null;
  last_price: number | null;
  last_checked: string | null;
  price_history: PriceHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface CollectionItem {
  id: string;
  user_id: string;
  item_kind?: "owned" | "watch" | "inventory" | "prospect" | null;
  title?: string | null;
  player_name: string; // Primary player (for backward compatibility)
  players?: string[] | null; // All players (for multi-player cards) - stored as JSON array in DB
  year: string | null;
  set_name: string | null;
  insert?: string | null; // Insert type (e.g., "Downtown")
  parallel_type?: string | null; // e.g., "Silver Prizm", "Holo"
  card_number?: string | null; // e.g., "349"
  grade: string | null;
  grading_company?: string | null; // PSA, BGS, SGC, CGC, etc.
  cert_number?: string | null; // Certification number from grading company
  psa_cert_number?: string | null;
  acquisition_type?: AcquisitionType | null;
  purchase_price: number | null;
  purchase_date: string | null;
  image_url: string | null;
  image_source?: CardImageSource | null;
  trusted_image?: TrustedCardImage | null;
  user_image_url?: string | null;
  notes: string | null;
  quantity?: number | null;
  acquisition_date?: string | null;
  cost_basis_total_cents?: number | null;
  tax_cents?: number | null;
  shipping_cents?: number | null;
  fees_paid_cents?: number | null;
  condition_status?: "raw" | "graded" | null;
  channel?: "ebay" | "whatnot" | "instagram" | "show" | "local" | "other" | null;
  status?: "unlisted" | "listed" | "pending_sale" | "sold" | "returned" | null;
  list_price_cents?: number | null;
  current_market_value_cents?: number | null;
  target_price?: number | null;
  estimated_cmv: number | null;
  cmv_confidence: CmvConfidence;
  cmv_last_updated: string | null;
  comps_count?: number | null;
  created_at: string;
  /**
   * Estimated current market value (CMV) for this card.
   * Backed by comps / pricing engine when available.
   * Nullable because many cards may not have pricing yet.
   */
  est_cmv?: number | null;
  // Related card images (joined from card_images table)
  card_images?: CardImage[];
  // Primary image (position 0) for display
  primary_image?: CardImage;
}

// Card image record for multi-image support
export interface CardImage {
  id: string;
  card_id: string;
  user_id: string;
  storage_path: string;
  position: number;
  label?: "front" | "back" | string | null;
  created_at: string;
  // URL computed on client/server
  url?: string;
}

export type CardImageSource = "psa" | "user" | "none";

export interface TrustedCardImage {
  source: CardImageSource;
  frontUrl: string | null;
  backUrl: string | null;
  frontCandidates: string[];
  backCandidates: string[];
  hasFallbackCta: boolean;
}

export interface Comp {
  title: string;
  price: number;
  date: string;
  link: string;
  image?: string;
  source: "ebay";
  included?: boolean;
  category?: "exact" | "similar" | "support" | "rejected";
  include_reason_codes?: string[];
  exclude_reason_codes?: string[];
  include_reasons_text?: string[];
  exclude_reasons_text?: string[];
  match_confidence?: number;
  identity_confidence?: number;
  valuation_weight?: number;
  quality_score?: number;
}

export interface CompsStats {
  cmv: number | null; // Current Market Value (median)
  avg: number;
  low: number;
  high: number;
  count: number;
}

// For Sale item from Browse API
export interface ForSaleItem {
  title: string;
  price: number;
  shipping?: number;
  condition?: string;
  url: string;
  image?: string;
}

// For Sale data from Browse API
export interface ForSaleData {
  count: number;
  low: number;
  median: number;
  high: number;
  items: ForSaleItem[];
  cachedAt?: string;
}

// Estimated Sale Range (Beta) - calculated from active listings
export interface EstimatedSaleRange {
  pricingAvailable: boolean;
  marketAsk?: {
    count: number;
    medianAsk: number;
    p20: number;
    p80: number;
  };
  estimatedSaleRange?: {
    low: number;
    high: number;
    discountApplied: number;
    confidence: "high" | "medium" | "low";
    spreadPct: number;
  };
  notes?: string[];
  reason?: string;
}

export interface SearchResult {
  comps: Comp[];
  stats: CompsStats;
  query: string;
  // New fields for dual-signal data
  _forSale?: ForSaleData;
  _estimatedSaleRange?: EstimatedSaleRange;
  _disclaimers?: string[];
  // Multi-pass search metadata
  _passUsed?: "strict" | "broad" | "minimal";
  _totalPasses?: number;
  _marketDiscount?: {
    method: "sold_median" | "listing_adjusted" | "insufficient_data";
    cmv: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    confidence: "high" | "medium" | "low";
    listingMedian: number | null;
    soldMedian: number | null;
    listingCount: number;
    soldCount: number;
    expectedDiscountRatio: number | null;
    expectedDiscountP25: number | null;
    expectedDiscountP75: number | null;
    expectedDiscountConfidence: "high" | "medium" | "low" | null;
    cardFingerprint: string;
    queryText: string;
  };
  _compEvaluation?: {
    exactComps: Comp[];
    similarComps: Comp[];
    supportComps: Comp[];
    rejectedComps: Comp[];
    confidenceScore: number;
    confidenceBand: "high" | "medium" | "low" | "very_low";
    confidenceExplanation: string;
    valuationSource:
      | "exact_sold"
      | "mixed_sold"
      | "active_directional"
      | "insufficient_exact_comps";
    usedCompCount: number;
    exactCompCount: number;
    similarCompCount: number;
    supportCompCount: number;
    rejectedCompCount: number;
    spreadPct: number | null;
    rangeLow: number | null;
    rangeHigh: number | null;
    midpoint: number | null;
    disclaimerStates: string[];
    disclaimerMessages: string[];
    includeReasonSummary: string[];
    excludeReasonSummary: string[];
  };
}

// Grade estimation from AI analysis
export type GradeFindingIssueType =
  | "scratch"
  | "scuff"
  | "print_line"
  | "dent"
  | "dimple"
  | "stain"
  | "smudge"
  | "foil_roll"
  | "chipping"
  | "rough_cut"
  | "whitening"
  | "corner_wear"
  | "edge_wear"
  | "other";

export interface GradeFinding {
  issue_type: GradeFindingIssueType;
  location: string;
  severity_0_3: number;
  confidence_0_100: number;
  notes: string;
}

export interface GradeImageQuality {
  overall_image_score: number;
  subscores: {
    focus_sharpness: number;
    lighting_glare_control: number;
    coverage_angles: number;
    resolution_distance: number;
  };
  key_issues: string[];
  retake_tips: string[];
}

export interface GradeEstimateConfidence {
  overall_confidence_score: number;
  confidence_label: "high" | "medium" | "low";
  limiting_factors: string[];
  what_was_clear: string[];
}

export interface GradeEstimateCenteringDetail {
  left_right_ratio: string;
  top_bottom_ratio: string;
  centering_confidence_score: number;
  centering_severity_0_3: number;
  centering_notes: string;
}

export interface GradeEstimateAnalysisMetadata {
  feature_version?: string;
  grading_profile?: string;
  card_category?: "sports" | "pokemon" | "one_piece" | "other_tcg";
  centering_score?: number;
  surface_score?: number;
  corners_score?: number;
  edges_score?: number;
  weighted_evidence_score?: number;
  calibrated_score?: number;
  worst_axis_deviation?: number;
  parse_incomplete_flag?: boolean;
  missing_closeups_flag?: boolean;
  limited_visibility_flag?: boolean;
}

export type GradeScanPhotoKind =
  | "front"
  | "back"
  | "corner_tl"
  | "corner_tr"
  | "corner_bl"
  | "corner_br"
  | "edges"
  | "surface"
  | "other";

export interface GradeScanPhoto {
  url: string;
  kind: GradeScanPhotoKind;
  sort_order?: number;
}

export interface GradeEvidencePhotoSources {
  corners: GradeScanPhotoKind[];
  edges: GradeScanPhotoKind[];
  surface: GradeScanPhotoKind[];
}

export interface GradeEstimate {
  estimated_grade_low: number;
  estimated_grade_high: number;
  centering: string;
  corners: string;
  surface: string;
  edges: string;
  grade_notes: string;
  image_quality?: GradeImageQuality;
  confidence?: GradeEstimateConfidence;
  centering_detail?: GradeEstimateCenteringDetail;
  surface_findings?: GradeFinding[];
  corners_findings?: GradeFinding[];
  edges_findings?: GradeFinding[];
  grade_probabilities?: GradeProbabilities;
  /** Short model-written notes on how each major grader would view this card (optional). */
  grader_perspectives?: GradeGraderPerspectives;
  analysis_status?: "ok" | "low_confidence" | "unable";
  analysis_reason?: string;
  analysis_warning_code?: "parse_error" | "low_confidence" | "unable";
  evidence_photo_sources?: GradeEvidencePhotoSources;
  visibility_notes?: string[];
  model_version_used?: string;
  feature_version_used?: string;
  analysis_metadata?: GradeEstimateAnalysisMetadata;
}

/** Four outcome bands aligned to half-point scales (BGS-style buckets; UI maps labels per company). */
export type HalfPointGradeDistribution = {
  "9.5": number;
  "9": number;
  "8.5": number;
  "8_or_lower": number;
};

export interface GradeGraderPerspectives {
  psa?: string;
  bgs?: string;
  cgc?: string;
  sgc?: string;
  tag?: string;
}

export interface GradeProbabilities {
  psa: {
    "10": number;
    "9": number;
    "8": number;
    "7_or_lower": number;
  };
  bgs: HalfPointGradeDistribution;
  cgc: HalfPointGradeDistribution;
  sgc: HalfPointGradeDistribution;
  tag: HalfPointGradeDistribution;
  confidence?: "high" | "medium" | "low";
}

export interface GradeCmv {
  price: number | null;
  n: number;
  lastSoldAt?: string;
  method: "median" | "trimmedMean" | "none";
}

export interface WorthGradingResult {
  raw: GradeCmv;
  psa: {
    "10": GradeCmv;
    "9": GradeCmv;
    "8": GradeCmv;
    ev: number;
    netGain: number;
    roi: number;
  };
  bgs: {
    "9.5": GradeCmv;
    "9": GradeCmv;
    "8.5": GradeCmv;
    ev: number;
    netGain: number;
    roi: number;
  };
  bestOption: "psa" | "bgs" | "none";
  rating: "strong_yes" | "yes" | "maybe" | "no";
  confidence: "high" | "medium" | "low";
  explanation: string;
}

export interface GradeEstimatorHistoryCardSnapshot {
  player_name: string;
  year?: string;
  set_name?: string;
  card_number?: string;
  parallel_type?: string;
  variation?: string;
  insert?: string;
  grade?: string;
  imageUrl?: string;
  imageUrls?: string[];
  scanPhotos?: GradeScanPhoto[];
  confidence?: "high" | "medium" | "low";
}

export interface GradeEstimatorHistoryRun {
  id: string;
  user_id: string;
  job_id: string;
  card: GradeEstimatorHistoryCardSnapshot;
  estimate: GradeEstimate;
  post_grading_value?: WorthGradingResult | null;
  labels?: GradeScanLabel[];
  actual_grade_psa?: string | null;
  model_version_used?: string | null;
  feature_version_used?: string | null;
  created_at: string;
}

export type GradeScanLabelGrader = "psa" | "bgs" | "sgc" | "tag" | "other";

export interface GradeScanLabel {
  id: string;
  scan_id: string;
  user_id: string;
  grader: GradeScanLabelGrader;
  label_text: string;
  label_grade_numeric?: number | null;
  evidence_url?: string | null;
  created_at: string;
}

export type GradingSubmissionMode = "mock" | "actual";
export type GradingSubmissionGrader = "psa";
export type GradingSubmissionStatus =
  | "draft"
  | "ready"
  | "shipped"
  | "arrived"
  | "grading"
  | "qa"
  | "shipped_back"
  | "received"
  | "completed";
export type GradingSubmissionSourceType = "collection" | "watchlist" | "manual";

export interface GradingSubmission {
  id: string;
  user_id: string;
  name: string;
  mode: GradingSubmissionMode;
  grader: GradingSubmissionGrader;
  status: GradingSubmissionStatus;
  psa_order_id: string | null;
  service_level: string | null;
  declared_value_cents: number;
  shipping_cents: number;
  insurance_cents: number;
  fees_estimate_cents: number;
  fees_actual_cents: number | null;
  created_at: string;
  updated_at: string;
}

export interface GradingSubmissionItem {
  id: string;
  submission_id: string;
  user_id: string;
  source_type: GradingSubmissionSourceType;
  source_id: string | null;
  title: string;
  quantity: number;
  cost_basis_cents: number | null;
  predicted_distribution: {
    "10": number;
    "9": number;
    "8": number;
    "7_or_lower": number;
  };
  target_grade: string | null;
  estimated_value_by_grade: {
    "10": number | null;
    "9": number | null;
    "8": number | null;
    "7_or_lower": number | null;
  };
  expected_value_cents: number;
  break_even_grade: string | null;
  risk_flags: string[];
  actual_grade: string | null;
  cert_number: string | null;
  created_at: string;
  updated_at: string;
}

export type FieldConfidence = "high" | "medium" | "low";
export type FieldSource = "ocr" | "vision" | "user" | "catalog" | "inferred";

export type CardIdentity = {
  player: string | null;
  year: number | null;
  brand: string | null; // e.g., Panini, Topps, Upper Deck
  setName: string | null; // e.g., Mosaic, Prizm, Donruss Optic, Bowman Chrome
  subset: string | null; // e.g., Base, Silver Prizm, Green Mosaic, Purple Prizm
  sport: string | null; // category/game, e.g., Football, Basketball, Pokemon, One Piece
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

export interface CardIdentification {
  player_name: string; // Primary player (for backward compatibility)
  players?: string[]; // All players (for multi-player cards)
  year: string;
  set_name: string;
  insert?: string; // Insert type (e.g., "Downtown")
  variant: string; // Parallel/variant (not used for inserts)
  grade: string;
  confidence: "high" | "medium" | "low";
  card_identity?: CardIdentity; // Canonical identity metadata (optional)
}

export interface CardIdentificationError {
  error: string;
  reason?: string;
  details?: string;
}

export type CardIdentificationResponse =
  | CardIdentification
  | CardIdentificationError;

export interface SearchFormData {
  player_name: string;
  players?: string[]; // All players (for multi-player cards)
  year?: string;
  set_name?: string;
  insert?: string; // Insert type (e.g., "Downtown")
  grade?: string;
  card_number?: string;
  parallel_type?: string;
  serial_number?: string;
  variation?: string;
  autograph?: string;
  relic?: string;
}

// Extended result from card identification including image URL
export interface CardIdentificationResult extends SearchFormData {
  imageUrl: string;
  imageUrls?: string[];
  scanPhotos?: GradeScanPhoto[];
  userImageUrl?: string;
  owner_declared_title?: string;
  confidence: "high" | "medium" | "low";
  players?: string[]; // All players (for multi-player cards)
  insert?: string; // Insert type (e.g., "Downtown")
  cardIdentity?: CardIdentity;
  confirmedYear?: string;
  // gradeEstimate removed - only available via explicit grade-estimate API
}

export type CardImageFields = {
  image_url?: string;
  image_source?: CardImageSource | null;
  psa_cert_number?: string | null;
  user_image_url?: string;
};

export type AcquisitionType =
  | "pulled"
  | "bought"
  | "trade"
  | "gift"
  | "unknown"
  | "buy"
  | "rip"
  | "consignment"
  | "other";

// Condition options for the add to collection modal
export const CONDITION_OPTIONS = [
  { label: "Raw (Ungraded)", value: "Raw" },
  { label: "PSA 10 - Gem Mint", value: "PSA 10" },
  { label: "PSA 9 - Mint", value: "PSA 9" },
  { label: "PSA 8 - Near Mint-Mint", value: "PSA 8" },
  { label: "PSA 7 - Near Mint", value: "PSA 7" },
  { label: "PSA 6 - Excellent-Mint", value: "PSA 6" },
  { label: "BGS 10 - Black Label", value: "BGS 10" },
  { label: "BGS 9.5 - Gem Mint", value: "BGS 9.5" },
  { label: "BGS 9 - Mint", value: "BGS 9" },
  { label: "BGS 8.5 - Near Mint-Mint+", value: "BGS 8.5" },
  { label: "BGS 8 - Near Mint-Mint", value: "BGS 8" },
  { label: "SGC 10 - Gem Mint", value: "SGC 10" },
  { label: "SGC 9.5 - Mint+", value: "SGC 9.5" },
  { label: "SGC 9 - Mint", value: "SGC 9" },
  { label: "CGC 10 - Pristine", value: "CGC 10" },
  { label: "CGC 9.5 - Gem Mint", value: "CGC 9.5" },
  { label: "CGC 9 - Mint", value: "CGC 9" },
] as const;

export const LIMITS = {
  FREE_SEARCHES: 3,
  FREE_COLLECTION: 5,
  FREE_WATCHLIST: 0, // Watchlist is Pro-only
  FREE_AI_MESSAGES: 3, // Free users get 3 AI messages
} as const;

export function isCardIdentificationError(
  response: CardIdentificationResponse
): response is CardIdentificationError {
  return "error" in response;
}

export interface ParsedSearch {
  player_name: string;
  year?: string;
  set_name?: string;
  grade?: string;
  card_number?: string;
  parallel_type?: string;
  serial_number?: string;
  variation?: string;
  autograph?: string;
  relic?: string;
  confidence: "high" | "medium" | "low";
  unparsed_tokens: string[];
}

export interface RecentSearch {
  query: string;
  parsed: ParsedSearch;
  timestamp: number;
  resultCount?: number;
  cmv?: number | null;
}

export type CmvConfidence = "high" | "medium" | "low" | "unavailable";

// CardzCheck Analyst types
export interface CardContext {
  playerName?: string;
  year?: string;
  setName?: string;
  grade?: string;
  recentSales?: Array<{ price: number; date: string }>;
  avgPrice?: number;
  priceChange30d?: number;
}

export interface AnalystMessage {
  role: "user" | "assistant";
  content: string;
}

// Persistent analyst chat types
export interface AnalystThread {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AnalystThreadMessage {
  id: string | null;
  thread_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface AnalystRequest {
  message: string;
  cardContext?: CardContext;
}

export interface AnalystResponse {
  response: string;
}

export interface AnalystError {
  error: string;
  message?: string;
  used?: number;
  limit?: number;
}

export interface BusinessConsultation {
  id: string;
  user_id: string;
  business_account_id: string;
  title: string;
  prompt: string;
  response: string;
  context_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export const ANALYST_LIMITS = {
  QUERIES_PER_USER: 100,
} as const;

// =============================================
// eBay Integration Types
// =============================================

export interface EbayAccount {
  id: string;
  user_id: string;
  ebay_user_id: string | null;
  ebay_username: string | null;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  scopes: string[];
  is_active: boolean;
  top_rated_seller: boolean;
  created_at: string;
  updated_at: string;
}

export interface EbayListingRecord {
  id: string;
  user_id: string;
  inventory_source: "business_inventory_items" | "collection_items";
  inventory_source_id: string;
  ebay_listing_id: string;
  ebay_sku: string | null;
  title: string;
  status: "active" | "ended" | "sold" | "error";
  listed_price_cents: number;
  ebay_category_id: string | null;
  listing_url: string | null;
  last_synced_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface EbayImportJob {
  id: string;
  user_id: string;
  job_type: "listings" | "sales";
  status: "pending" | "running" | "completed" | "failed";
  total_count: number | null;
  processed_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface EbayAccountStatus {
  connected: boolean;
  ebay_username: string | null;
  top_rated_seller: boolean;
  access_token_expires_at: string | null;
  /** eBay store subscription tier — drives the FVF rate in EbayProfitEngine. */
  store_tier: import("@/lib/business/EbayProfitEngine").StoreTier;
  /** OAuth scopes granted by the user — used to detect scope gaps (e.g. buy.order.readonly). */
  scopes: string[];
}

// =============================================
// User Storefronts
// =============================================

export type StorefrontPlatform =
  | "ebay"
  | "whatnot"
  | "website"
  | "shopify"
  | "mercari"
  | "comc"
  | "myslabs"
  | "custom";

export interface UserStorefront {
  id: string;
  user_id: string;
  platform: StorefrontPlatform;
  display_name: string;
  store_url: string;
  is_primary: boolean;
  notes: string | null;
  platform_settings: StorefrontPlatformSettings;
  created_at: string;
  updated_at: string;
}

// Platform-specific settings stored as JSONB.
// Each platform type gets its own shape; unknown platforms fall back to base.

export interface StorefrontSettingsBase {
  fee_rate_percent?: number | null;
  payment_processing_percent?: number | null;
}

export interface WhatnotStorefrontSettings extends StorefrontSettingsBase {
  seller_fee_percent?: number | null;
  shipping_fee_percent?: number | null;
  buyer_premium_percent?: number | null;
}

export interface WebsiteStorefrontSettings extends StorefrontSettingsBase {
  payment_processor?: string | null;
  payment_flat_fee_cents?: number | null;
  monthly_ad_spend_cents?: number | null;
  ad_platforms?: string[] | null;
  monthly_hosting_cents?: number | null;
  monthly_other_costs_cents?: number | null;
  other_costs_label?: string | null;
}

export interface ShopifyStorefrontSettings extends StorefrontSettingsBase {
  monthly_plan_cents?: number | null;
  transaction_fee_percent?: number | null;
}

export interface MercariStorefrontSettings extends StorefrontSettingsBase {
  seller_fee_percent?: number | null;
}

export type StorefrontPlatformSettings =
  | WhatnotStorefrontSettings
  | WebsiteStorefrontSettings
  | ShopifyStorefrontSettings
  | MercariStorefrontSettings
  | StorefrontSettingsBase;

export const WHATNOT_DEFAULTS: WhatnotStorefrontSettings = {
  seller_fee_percent: 9.5,
  payment_processing_percent: 2.9,
  shipping_fee_percent: 0,
  buyer_premium_percent: 3,
};

export const WEBSITE_DEFAULTS: WebsiteStorefrontSettings = {
  payment_processing_percent: 2.9,
  payment_processor: "Stripe",
  payment_flat_fee_cents: 30,
  monthly_ad_spend_cents: 0,
  ad_platforms: [],
  monthly_hosting_cents: 0,
  monthly_other_costs_cents: 0,
  other_costs_label: null,
};

export const MERCARI_DEFAULTS: MercariStorefrontSettings = {
  seller_fee_percent: 10,
  payment_processing_percent: 2.9,
};

export const SHOPIFY_DEFAULTS: ShopifyStorefrontSettings = {
  transaction_fee_percent: 0,
  payment_processing_percent: 2.9,
  monthly_plan_cents: 3900,
};

export function getDefaultPlatformSettings(platform: StorefrontPlatform): StorefrontPlatformSettings {
  switch (platform) {
    case "whatnot": return { ...WHATNOT_DEFAULTS };
    case "website": return { ...WEBSITE_DEFAULTS };
    case "mercari": return { ...MERCARI_DEFAULTS };
    case "shopify": return { ...SHOPIFY_DEFAULTS };
    default: return {};
  }
}

export const AD_PLATFORM_OPTIONS = [
  "Google Ads",
  "Meta (Facebook/Instagram)",
  "TikTok Ads",
  "Twitter/X Ads",
  "eBay Promoted Listings",
  "Whatnot Promoted",
  "Other",
] as const;

export const STOREFRONT_PLATFORMS: {
  value: StorefrontPlatform;
  label: string;
  placeholder: string;
  icon: string;
}[] = [
  { value: "ebay", label: "eBay", placeholder: "https://www.ebay.com/str/yourstore", icon: "ebay" },
  { value: "whatnot", label: "Whatnot", placeholder: "https://www.whatnot.com/user/yourname", icon: "whatnot" },
  { value: "website", label: "Website", placeholder: "https://yourstore.com", icon: "globe" },
  { value: "shopify", label: "Shopify", placeholder: "https://yourstore.myshopify.com", icon: "shopify" },
  { value: "mercari", label: "Mercari", placeholder: "https://www.mercari.com/u/yourname", icon: "mercari" },
  { value: "comc", label: "COMC", placeholder: "https://www.comc.com/Users/yourname", icon: "comc" },
  { value: "myslabs", label: "MySlabs", placeholder: "https://myslabs.com/shop/yourname", icon: "myslabs" },
  { value: "custom", label: "Other Platform", placeholder: "https://your-storefront-url.com", icon: "custom" },
];
