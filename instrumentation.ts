export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate required environment variables on server startup.
    const { validateEnv } = await import("./lib/env-check");
    validateEnv();
  }
}
