# Abuse Protection

## Rate limiting
- **Scope**: Best-effort sliding-window limits are enforced in middleware for these routes:
  - `/api/search`: 60 requests per minute
  - `/api/identify-card`: 10 requests per minute
  - `/api/grade-estimate`: 10 requests per minute
  - `/api/analyst`: 20 requests per minute
- **Keying**: IP address + Supabase user ID (when available).
- **Response**: `429` with a JSON error payload and `Retry-After` header indicating when to retry.
- **Notes**: Limits are in-memory and edge-safe; they reset on cold starts or redeploys.

## Upload validation (`/api/identify-card`)
- **Base64**: Only `image/jpeg`, `image/png`, and `image/webp` are allowed with a max decoded size of 10MB.
- **URL**: Only `https://` URLs are accepted. The server performs a `HEAD` check before fetching, rejecting non-image types or images larger than 10MB.
- **Failure behavior**: If validation fails or cannot be completed, the API responds with `400` and `Unsupported image format or size`.
