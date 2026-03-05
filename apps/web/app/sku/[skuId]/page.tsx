import { SkuDetailClient } from "@/components/SkuDetailClient";

export default function SkuPage({ params }: { params: { skuId: string } }) {
  return <SkuDetailClient skuId={params.skuId} />;
}
