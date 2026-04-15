export function appendSpeechTranscript(
  currentValue: string,
  transcript: string,
  mode: "space" | "newline" = "space"
): string {
  const incoming = transcript.trim();
  if (!incoming) return currentValue;

  const current = currentValue ?? "";
  if (!current.trim()) return incoming;

  if (mode === "newline") {
    return `${current.replace(/\s*$/, "")}\n${incoming}`;
  }

  return /\s$/.test(current) ? `${current}${incoming}` : `${current} ${incoming}`;
}
