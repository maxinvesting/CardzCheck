export interface User {
  id: string;
  email: string;
  is_paid: boolean;
  stripe_customer_id: string | null;
  free_searches_used: number;
  created_at: string;
  plan_selected?: boolean; // Whether user has selected a plan (prevents modal from showing again)
}

export interface CollectionItem {
  id: string;
  user_id: string;
  player_name: string;
  year: string | null;
  set_name: string | null;
  grade: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface Comp {
  title: string;
  price: number;
  date: string;
  link: string;
  image?: string;
  source: "ebay";
}

export interface CompsStats {
  cmv: number; // Current Market Value (median)
  avg: number;
  low: number;
  high: number;
  count: number;
}

export interface SearchResult {
  comps: Comp[];
  stats: CompsStats;
  query: string;
}

export interface CardIdentification {
  player_name: string;
  year: string;
  set_name: string;
  variant: string;
  grade: string;
  confidence: "high" | "medium" | "low";
}

export interface CardIdentificationError {
  error: string;
  reason: string;
}

export type CardIdentificationResponse =
  | CardIdentification
  | CardIdentificationError;

export interface SearchFormData {
  player_name: string;
  year?: string;
  set_name?: string;
  grade?: string;
}

export const LIMITS = {
  FREE_SEARCHES: 3,
  FREE_COLLECTION: 5,
} as const;

export function isCardIdentificationError(
  response: CardIdentificationResponse
): response is CardIdentificationError {
  return "error" in response;
}
