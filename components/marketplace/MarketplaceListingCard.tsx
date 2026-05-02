import Link from "next/link";

export type MarketplaceListingCardProps = {
  id: string;
  title: string;
  year: number;
  player: string;
  grade: string;
  grading_service: string;
  list_price_cents: number;
  pipeline: "standard" | "elite" | "grails";
  status: "active" | "price_reduced";
};

const PIPELINE_BADGE: Record<MarketplaceListingCardProps["pipeline"], string> = {
  standard: "border-gray-700 text-gray-400",
  elite: "border-purple-500 text-purple-300",
  grails: "border-amber-500 text-amber-300",
};

export default function MarketplaceListingCard(props: MarketplaceListingCardProps) {
  return (
    <Link
      href={`/marketplace/listing/${props.id}`}
      className="block rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-cyan-500 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{props.title}</div>
          <div className="text-xs text-gray-500 mt-1">
            {props.year} · {props.player}
          </div>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${PIPELINE_BADGE[props.pipeline]}`}
        >
          {props.pipeline}
        </span>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <div>
          <div className="text-xl font-semibold">
            ${(props.list_price_cents / 100).toLocaleString()}
          </div>
          {props.status === "price_reduced" && (
            <div className="text-[10px] text-amber-400 mt-0.5">Price reduced</div>
          )}
        </div>
        <div className="text-xs text-gray-400">
          {props.grading_service} {props.grade}
        </div>
      </div>
    </Link>
  );
}
