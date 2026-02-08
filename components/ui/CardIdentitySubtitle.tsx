"use client";

import { formatCardSubtitle } from "@/lib/card-identity/display";
import type { CardIdentityDisplayInput } from "@/lib/card-identity/display";

interface CardIdentitySubtitleProps {
  /** Card identity (or partial, e.g. from CollectionItem). Null/undefined = show nothing (no stale text). */
  identity: CardIdentityDisplayInput | null | undefined;
  className?: string;
}

/**
 * Renders the collector-native subtitle for a card (year • brand setName | parallel).
 * Shows nothing when identity is null to avoid identity leakage.
 */
export default function CardIdentitySubtitle({ identity, className = "" }: CardIdentitySubtitleProps) {
  const text = formatCardSubtitle(identity);
  if (!text) return null;
  return (
    <p className={`text-sm text-gray-500 dark:text-gray-400 truncate ${className}`.trim()}>
      {text}
    </p>
  );
}
