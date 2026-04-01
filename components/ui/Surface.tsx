import { type HTMLAttributes, forwardRef } from "react";

/**
 * Surface — canonical panel / card wrapper for the Business UI.
 *
 * Visual contract (calm, spreadsheet-like SaaS):
 *   • Flat surface background  (--surface)
 *   • Subtle border            (--border)
 *   • 12 px corner radius
 *   • 20 px internal padding (overridable via className)
 *   • No shadow, no glow
 */
interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional section title rendered above children in muted label style */
  title?: string;
  children: React.ReactNode;
}

const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ title, className = "", children, style, ...rest }, ref) => (
    <div
      ref={ref}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        ...style,
      }}
      className={`cc-surface p-5 ${className}`}
      {...rest}
    >
      {title && (
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-normal text-[var(--biz-muted)]">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
);
Surface.displayName = "Surface";

export { Surface };
