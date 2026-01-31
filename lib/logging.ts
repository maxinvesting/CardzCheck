export const isDebugLoggingEnabled = (): boolean =>
  process.env.NODE_ENV !== "production";

export const redactId = (value?: string | null): string => {
  if (!value) {
    return "unknown";
  }

  const tail = value.slice(-6);
  return `***${tail}`;
};

export const logDebug = (
  message: string,
  meta?: Record<string, unknown>
): void => {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  if (meta) {
    console.log(message, meta);
  } else {
    console.log(message);
  }
};
