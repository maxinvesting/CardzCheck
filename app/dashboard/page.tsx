"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import SearchBar from "@/components/SearchBar";
import HeroStats from "@/components/dashboard/HeroStats";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import AnalystWidget from "@/components/dashboard/AnalystWidget";
import { createClient } from "@/lib/supabase/client";
import type { User, CollectionItem, SearchFormData } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (isTestMode()) {
        setUser(getTestUser());
        const response = await fetch("/api/collection");
        const data = await response.json();
        if (data.items) {
          setCollectionItems(data.items);
        }
        setLoading(false);
        console.log("🧪 TEST MODE: Using mock user in Dashboard");
        return;
      }

      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/dashboard");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (userData) {
        setUser(userData as User);
      }

      const { data: items } = await supabase
        .from("collection_items")
        .select("*")
        .eq("user_id", authUser.id)
        .order("created_at", { ascending: false });

      if (items) {
        setCollectionItems(items as CollectionItem[]);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  const handleSearch = (data: SearchFormData) => {
    const params = new URLSearchParams();
    if (data.player_name) params.set("player", data.player_name);
    if (data.year) params.set("year", data.year);
    if (data.set_name) params.set("set", data.set_name);
    if (data.grade) params.set("grade", data.grade);
    if (data.parallel_type) params.set("parallel_type", data.parallel_type);
    if (data.card_number) params.set("card_number", data.card_number);
    if (data.serial_number) params.set("serial_number", data.serial_number);
    if (data.variation) params.set("variation", data.variation);
    if (data.autograph) params.set("autograph", data.autograph);
    if (data.relic) params.set("relic", data.relic);

    router.push(`/search?${params.toString()}`);
  };

  const userName = user?.name || (user?.email ? user.email.split("@")[0] : "");

  return (
    <AuthenticatedLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        {/* Compact Header with Greeting + Search */}
        <div className="mb-4">
          <p className="text-sm text-gray-400 mb-2">
            Welcome back{userName ? `, ${userName}` : ""}
          </p>
          <div className="max-w-2xl">
            <SearchBar onSearch={handleSearch} />
          </div>
        </div>

        {/* Hero Stats Section */}
        <div className="mb-4">
          <HeroStats items={collectionItems} loading={loading} onSearch={handleSearch} />
        </div>

        {/* Activity Feed + Analyst Widget */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <ActivityFeed recentCards={collectionItems.slice(0, 3)} />
          </div>
          <div className="lg:col-span-2">
            <AnalystWidget isPaid={user?.is_paid} />
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
