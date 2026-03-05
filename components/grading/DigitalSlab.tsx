/**
 * DigitalSlab — static CardzCheck AI estimate slab for grade reports and exports.
 *
 * Intentionally uses only inline styles (no Tailwind, no framer-motion) so the
 * component renders correctly in both html2canvas captures and browser print dialogs.
 *
 * This is NOT meant to resemble a PSA or BGS slab — it uses CardzCheck's own
 * neutral light palette suitable for white-background print layouts.
 */

interface DigitalSlabProps {
  imageUrl?: string | null;
  mostLikelyLabel?: string | null;
  mostLikelyPct?: number | null;
  expectedGrade?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  slabId?: string | null;
  cardLabel?: string | null;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "#059669",
  medium: "#2563eb",
  low: "#d97706",
};

const CONFIDENCE_BG: Record<string, string> = {
  high: "#ecfdf5",
  medium: "#eff6ff",
  low: "#fffbeb",
};

export function DigitalSlab({
  imageUrl,
  mostLikelyLabel,
  mostLikelyPct,
  expectedGrade,
  confidence,
  slabId,
  cardLabel,
}: DigitalSlabProps) {
  const pctDisplay =
    mostLikelyPct != null ? `${Math.round(mostLikelyPct * 100)}%` : null;

  const confColor = confidence ? (CONFIDENCE_COLOR[confidence] ?? "#6b7280") : "#6b7280";
  const confBg = confidence ? (CONFIDENCE_BG[confidence] ?? "#f9fafb") : "#f9fafb";
  const confLabel = confidence
    ? confidence.charAt(0).toUpperCase() + confidence.slice(1)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {/* Slab body */}
      <div
        style={{
          width: 210,
          borderRadius: 14,
          border: "1.5px solid #D1D5DB",
          backgroundColor: "#FFFFFF",
          overflow: "hidden",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",
        }}
      >
        {/* Top header */}
        <div
          style={{
            backgroundColor: "#F1F5F9",
            borderBottom: "1px solid #E2E8F0",
            padding: "10px 14px 9px",
          }}
        >
          <div
            style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#64748B",
              marginBottom: 5,
            }}
          >
            CardzCheck AI Estimate
          </div>

          {mostLikelyLabel ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#0F172A",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {mostLikelyLabel}
              </span>
              {pctDisplay ? (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#2563EB",
                  }}
                >
                  {pctDisplay}
                </span>
              ) : null}
            </div>
          ) : (
            <span style={{ fontSize: 22, fontWeight: 800, color: "#94A3B8" }}>—</span>
          )}

          {cardLabel ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 9,
                color: "#94A3B8",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 182,
              }}
            >
              {cardLabel}
            </div>
          ) : null}
        </div>

        {/* Card image area */}
        <div
          style={{
            backgroundColor: "#F8FAFC",
            borderBottom: "1px solid #E2E8F0",
            height: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Card"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                display: "block",
              }}
              crossOrigin="anonymous"
            />
          ) : (
            <div
              style={{
                width: 90,
                height: 126,
                borderRadius: 6,
                border: "1.5px dashed #CBD5E1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 9, color: "#94A3B8", letterSpacing: "0.08em" }}>
                NO IMAGE
              </span>
            </div>
          )}
        </div>

        {/* Stats section */}
        <div style={{ padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "#94A3B8",
                  marginBottom: 2,
                }}
              >
                Expected Grade
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>
                {expectedGrade ?? "—"}
              </div>
            </div>

            {confLabel ? (
              <div
                style={{
                  padding: "3px 8px",
                  borderRadius: 20,
                  backgroundColor: confBg,
                  border: `1px solid ${confColor}33`,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: confColor,
                }}
              >
                {confLabel}
              </div>
            ) : null}
          </div>

          {/* Slab ID */}
          <div
            style={{
              borderTop: "1px solid #F1F5F9",
              paddingTop: 7,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 8, color: "#CBD5E1", fontFamily: "monospace", letterSpacing: "0.04em" }}>
              {slabId ? `CC-${slabId}` : "CardzCheck"}
            </span>
            <span style={{ fontSize: 7, color: "#CBD5E1", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Grade Probability Engine
            </span>
          </div>
        </div>
      </div>

      {/* Legal disclaimer */}
      <p
        style={{
          fontSize: 9,
          color: "#94A3B8",
          textAlign: "center",
          margin: 0,
          letterSpacing: "0.02em",
          lineHeight: 1.4,
          maxWidth: 210,
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        AI estimate — not an official grade.
      </p>
    </div>
  );
}
