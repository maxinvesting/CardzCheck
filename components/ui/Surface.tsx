import { type HTMLAttributes, forwardRef } from "react";

/**
 * Surface — canonical panel / card wrapper for the Business UI.
 *
 * Visual contract (PSA/Beckett-style calm SaaS):
 *   • Flat dark background  (--biz-surface  #111827)
 *   • Subtle white border   (--biz-border   rgba(255,255,255,0.08))
 *   • 12 px corner radius   (--biz-radius)
 *   • 20 px internal padding (overridable via className)
 *   • No shadow, no glow
 *   • Hover: border brightens slightly — nothing more
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
        background: "var(--biz-surface)",
        border: "1px solid var(--biz-border)",
        borderRadius: "var(--biz-radius)",
        ...style,
      }}
      className={`p-5 transition-colors hover:border-white/[0.13] ${className}`}
      {...rest}
    >
      {title && (
        <h3 className="mb-4 text-xs font-semibold text-slate-400 tracking-wide">
          {title}
        </h3>
      )}
      {children}
    </div>
  )
);
Surface.displayName = "Surface";

export { Surface };
