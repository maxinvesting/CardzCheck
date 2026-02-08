export interface JsonParseResult<T = unknown> {
  value: T;
  warning?: string;
}

export function extractFirstJsonObject(input: string): string | null {
  const start = input.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function repairJsonOnce(input: string): string {
  return input
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

export function parseJsonWithRepair<T = unknown>(input: string): JsonParseResult<T> | null {
  const candidates = [input.trim(), extractFirstJsonObject(input)].filter(
    (value): value is string => Boolean(value)
  );

  for (const candidate of candidates) {
    try {
      return { value: JSON.parse(candidate) as T };
    } catch {
      try {
        const repaired = repairJsonOnce(candidate);
        return {
          value: JSON.parse(repaired) as T,
          warning: "Repaired malformed JSON",
        };
      } catch {
        continue;
      }
    }
  }

  return null;
}
