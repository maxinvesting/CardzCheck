"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { CartItem, ShopListing } from "@/types/shop";

const CART_STORAGE_KEY = "cardzcheck_shop_cart";

interface ShopCartContextType {
  items: CartItem[];
  isHydrated: boolean;
  addItem: (listingId: string, quantity: number, listing?: ShopListing) => void;
  removeItem: (listingId: string) => void;
  updateQuantity: (listingId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
}

const ShopCartContext = createContext<ShopCartContextType | null>(null);

function loadFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify(items.map(({ listingId, quantity }) => ({ listingId, quantity })))
    );
  } catch {
    // ignore
  }
}

export function ShopCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveToStorage(items);
    }
  }, [items, hydrated]);

  const addItem = useCallback(
    (listingId: string, quantity: number, listing?: ShopListing) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.listingId === listingId);
        const next = existing
          ? prev.map((i) =>
              i.listingId === listingId
                ? { ...i, quantity: i.quantity + quantity, listing: listing ?? i.listing }
                : i
            )
          : [...prev, { listingId, quantity, listing }];
        return next;
      });
    },
    []
  );

  const removeItem = useCallback((listingId: string) => {
    setItems((prev) => prev.filter((i) => i.listingId !== listingId));
  }, []);

  const updateQuantity = useCallback((listingId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.listingId !== listingId)
        : prev.map((i) =>
            i.listingId === listingId ? { ...i, quantity } : i
          )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <ShopCartContext.Provider
      value={{
        items,
        isHydrated: hydrated,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
      }}
    >
      {children}
    </ShopCartContext.Provider>
  );
}

export function useShopCart() {
  const ctx = useContext(ShopCartContext);
  if (!ctx) {
    throw new Error("useShopCart must be used within ShopCartProvider");
  }
  return ctx;
}
