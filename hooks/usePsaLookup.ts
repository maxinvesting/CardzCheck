"use client";

import { useState, useRef, useCallback } from "react";

export interface PsaLookupResult {
  player_name: string | null;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  grading_company: "PSA";
  parallel_type: string | null;
  image_urls?: string[];
}

export interface UsePsaLookupReturn {
  lookup: (certNumber: string) => void;
  lookupImmediate: (certNumber: string) => void;
  isLoading: boolean;
  result: PsaLookupResult | null;
  error: string | null;
  clearResult: () => void;
}

const MIN_CERT_LENGTH = 5;
const DEBOUNCE_MS = 500;

export function usePsaLookup(): UsePsaLookupReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PsaLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const performLookup = useCallback(async (certNumber: string) => {
    const id = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/psa/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certNumber }),
      });

      if (id !== requestIdRef.current) return;

      const data = await res.json();

      if (id !== requestIdRef.current) return;

      if (!res.ok || data.found === false) {
        setResult(null);
        setError(data.error ?? "Cert not found. Fill in details manually.");
      } else {
        setResult(data as PsaLookupResult);
        setError(null);
      }
    } catch {
      if (id !== requestIdRef.current) return;
      setResult(null);
      setError("PSA lookup failed. Fill in details manually.");
    } finally {
      if (id === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const lookup = useCallback(
    (certNumber: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = certNumber.trim();
      if (trimmed.length === 0) {
        setResult(null);
        setError(null);
        return;
      }
      if (trimmed.length < MIN_CERT_LENGTH) return;

      debounceRef.current = setTimeout(() => {
        performLookup(trimmed);
      }, DEBOUNCE_MS);
    },
    [performLookup]
  );

  const lookupImmediate = useCallback(
    (certNumber: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = certNumber.trim();
      if (trimmed.length >= MIN_CERT_LENGTH) {
        performLookup(trimmed);
      }
    },
    [performLookup]
  );

  const clearResult = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestIdRef.current++;
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { lookup, lookupImmediate, isLoading, result, error, clearResult };
}
