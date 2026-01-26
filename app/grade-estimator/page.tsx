"use client";

import { useState } from "react";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CardUploader from "@/components/CardUploader";
import GradeEstimateDisplay from "@/components/GradeEstimateDisplay";
import ConfirmAddCardModal from "@/components/ConfirmAddCardModal";
import PaywallModal from "@/components/PaywallModal";
import type { CardIdentificationResult } from "@/types";

export default function GradeEstimatorPage() {
  const [identifiedCard, setIdentifiedCard] = useState<CardIdentificationResult | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleReset = () => {
    setIdentifiedCard(null);
  };

  return (
    <AuthenticatedLayout>
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Grade Estimator</h1>
          <p className="text-gray-400 mt-1">
            Upload a photo of your card to get an AI-powered grade estimate
          </p>
        </div>

        {/* Info Card */}
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-sm text-blue-300">
              <p className="font-medium mb-1">How it works</p>
              <ul className="text-blue-400 space-y-1">
                <li>1. Upload a clear, well-lit photo of your raw (ungraded) card</li>
                <li>2. Our AI analyzes centering, corners, surface, and edges</li>
                <li>3. Get an estimated PSA grade range with detailed breakdown</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Card Uploader */}
        {!identifiedCard ? (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
            <CardUploader
              onIdentified={(data: CardIdentificationResult) => {
                setIdentifiedCard(data);
              }}
              disabled={false}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Identified Card Preview */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
              <div className="flex items-start gap-4">
                {identifiedCard.imageUrl && (
                  <img
                    src={identifiedCard.imageUrl}
                    alt={identifiedCard.player_name}
                    className="w-32 h-44 object-cover rounded-lg shadow-md"
                  />
                )}
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white">
                    {identifiedCard.player_name}
                  </h2>
                  <p className="text-gray-400 mt-1">
                    {[
                      identifiedCard.year,
                      identifiedCard.set_name,
                      identifiedCard.parallel_type,
                    ]
                      .filter(Boolean)
                      .join(" | ")}
                  </p>

                  {/* Confidence Badge */}
                  <div className="mt-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        identifiedCard.confidence === "high"
                          ? "bg-green-900/30 text-green-400"
                          : identifiedCard.confidence === "medium"
                          ? "bg-yellow-900/30 text-yellow-400"
                          : "bg-red-900/30 text-red-400"
                      }`}
                    >
                      {identifiedCard.confidence === "high"
                        ? "High confidence"
                        : identifiedCard.confidence === "medium"
                        ? "Medium confidence"
                        : "Low confidence"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => setShowConfirmModal(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      Add to Collection
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 font-medium transition-colors"
                    >
                      Upload New Card
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Grade Estimate */}
            {identifiedCard.gradeEstimate ? (
              <GradeEstimateDisplay estimate={identifiedCard.gradeEstimate} />
            ) : identifiedCard.grade ? (
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
                <div className="flex items-center gap-3">
                  <svg
                    className="w-6 h-6 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-white font-medium">Already Graded</p>
                    <p className="text-gray-400 text-sm">
                      This card is already graded: {identifiedCard.grade}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-900/20 border border-amber-800/50 rounded-xl p-6">
                <div className="flex items-center gap-3">
                  <svg
                    className="w-6 h-6 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div>
                    <p className="text-amber-300 font-medium">Grade Estimate Unavailable</p>
                    <p className="text-amber-400/80 text-sm">
                      Could not estimate grade. Try uploading a clearer image with better lighting.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confirm Add Card Modal */}
        <ConfirmAddCardModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onSuccess={(playerName) => {
            setToast({ type: "success", message: `Added ${playerName} to collection!` });
            setShowConfirmModal(false);
            handleReset();
          }}
          onLimitReached={() => {
            setShowConfirmModal(false);
            setShowPaywall(true);
          }}
          cardData={identifiedCard}
        />

        {/* Paywall Modal */}
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          type="collection"
        />

        {/* Toast */}
        {toast && (
          <div
            className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 ${
              toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
            }`}
          >
            {toast.type === "success" ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
}
