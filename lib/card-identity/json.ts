export function parseFirstJsonObject<T = unknown>(input: string): {
  value: T | null;
  error?: string;
} {
  if (!input) return { value: null, error: "empty" };

  const start = input.indexOf("{");
  if (start === -1) return { value: null, error: "no_object" };

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = input.slice(start, i + 1);
        try {
          const parsed = JSON.parse(candidate) as T;
          return { value: parsed };
        } catch (error) {
          return { value: null, error: error instanceof Error ? error.message : "parse_error" };
        }
      }
    }
  }

  return { value: null, error: "unterminated" };
}
