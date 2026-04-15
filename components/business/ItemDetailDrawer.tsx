"use client";

import type { BusinessInventoryItem } from "@/types";
import BusinessInventoryItemEditor from "@/components/business/BusinessInventoryItemEditor";

interface Props {
  item: BusinessInventoryItem | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<BusinessInventoryItem>) => void;
}

export default function ItemDetailDrawer({
  item,
  onClose,
  onSave,
}: Props) {
  if (!item) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-[#111827] border-l border-white/[0.08] z-50 overflow-y-auto">
        <BusinessInventoryItemEditor
          item={item}
          onSave={onSave}
          onClose={onClose}
          tone="dark"
          showOpenProfileLink
        />
      </div>
    </>
  );
}
