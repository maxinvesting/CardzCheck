export const getCollectionErrorMessage = (
  payload: unknown,
  fallback: string
): string => {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const maybePayload = payload as Record<string, unknown>;
  const directError = maybePayload.error;
  if (typeof directError === "string" && directError.trim().length > 0) {
    return directError;
  }

  const directMessage = maybePayload.message;
  if (typeof directMessage === "string" && directMessage.trim().length > 0) {
    return directMessage;
  }

  return fallback;
};
