export interface CardComp {
  id: string;
  card_id: string;
  title: string;
  price: number;
  date_sold: string | null;
  source: string;
  grade: string | null;
  match_quality: "exact" | "near" | "weak";
  is_selected: boolean;
  ebay_url: string | null;
  created_at: string;
}

export interface CardCmv {
  id: string;
  card_id: string;
  cmv_value: number | null;
  cmv_low: number | null;
  cmv_high: number | null;
  confidence: "high" | "medium" | "low";
  comps_count: number;
  excluded_count: number;
  last_updated: string;
}

export interface CmvCalculation {
  cmv_value: number;
  cmv_low: number;
  cmv_high: number;
  confidence: "high" | "medium" | "low";
  comps_count: number;
}
