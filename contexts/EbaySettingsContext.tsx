"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EbayFeeProfile = "standard" | "top_rated_plus";

export interface EbaySettingsContextType {
  /** Active fee profile */
  feeProfile: EbayFeeProfile;
  /** Decimal fee rate for the current profile (e.g. 0.13) */
  feeRate: number;
  /** Update the active fee profile and persist to localStorage */
  setFeeProfile: (profile: EbayFeeProfile) => void;
  /** Whether localStorage state has been hydrated */
  isHydrated: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "cardzcheck_ebay_fee_profile";

export const EBAY_FEE_RATES: Record<EbayFeeProfile, number> = {
  standard: 0.13,
  top_rated_plus: 0.12,
};

export const EBAY_FEE_LABELS: Record<EbayFeeProfile, string> = {
  standard: "Standard (13%)",
  top_rated_plus: "Top Rated Plus (12%)",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadProfile(): EbayFeeProfile {
  if (typeof window === "undefined") return "standard";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "standard" || raw === "top_rated_plus") return raw;
  } catch {
    // ignore
  }
  return "standard";
}

function saveProfile(profile: EbayFeeProfile) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, profile);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const EbaySettingsContext = createContext<EbaySettingsContextType | null>(null);

export function EbaySettingsProvider({ children }: { children: ReactNode }) {
  const [feeProfile, setFeeProfileState] = useState<EbayFeeProfile>("standard");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // 1. Immediately hydrate from localStorage so UI is never blank
    const stored = loadProfile();
    setFeeProfileState(stored);
    setHydrated(true);

    // 2. Fetch account status and override if top_rated_seller is known from eBay
    //    This upgrades the approximation to the real seller tier from the DB.
    fetch("/api/business/ebay/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.connected) return;
        const serverProfile: EbayFeeProfile = data.top_rated_seller
          ? "top_rated_plus"
          : "standard";
        // Only override localStorage if the server knows the seller is Top Rated Plus
        // (avoids reverting manual overrides on disconnect)
        if (data.top_rated_seller) {
          setFeeProfileState(serverProfile);
          saveProfile(serverProfile);
        }
      })
      .catch(() => {
        // Non-fatal — localStorage value remains
      });
  }, []);

  const setFeeProfile = useCallback((profile: EbayFeeProfile) => {
    setFeeProfileState(profile);
    saveProfile(profile);
  }, []);

  const feeRate = EBAY_FEE_RATES[feeProfile];

  return (
    <EbaySettingsContext.Provider
      value={{ feeProfile, feeRate, setFeeProfile, isHydrated: hydrated }}
    >
      {children}
    </EbaySettingsContext.Provider>
  );
}

export function useEbaySettings(): EbaySettingsContextType {
  const ctx = useContext(EbaySettingsContext);
  if (!ctx) {
    throw new Error("useEbaySettings must be used within EbaySettingsProvider");
  }
  return ctx;
}
