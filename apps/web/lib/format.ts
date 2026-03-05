export function formatUsdc(value: bigint): string {
  const isNegative = value < 0n;
  const absolute = isNegative ? -value : value;
  const whole = absolute / 1_000_000n;
  const fractional = absolute % 1_000_000n;
  const fractionText = fractional.toString().padStart(6, "0").replace(/0+$/, "");
  const amount = fractionText.length ? `${whole.toString()}.${fractionText}` : whole.toString();
  return isNegative ? `-${amount}` : amount;
}

export function parseUsdc(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Price is required");
  }
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) {
    throw new Error("Price must be a positive number with up to 6 decimals");
  }

  const [wholePart, fracPart = ""] = trimmed.split(".");
  const whole = BigInt(wholePart) * 1_000_000n;
  const fraction = BigInt((fracPart + "000000").slice(0, 6));
  return whole + fraction;
}
