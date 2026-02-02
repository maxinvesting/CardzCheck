"use client";

import { useEffect, useState } from "react";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CardUploader from "@/components/CardUploader";
import GradeEstimateDisplay from "@/components/GradeEstimateDisplay";
import GradeEstimatorValuePanel from "@/components/GradeEstimatorValuePanel";
import ConfirmAddCardModal from "@/components/ConfirmAddCardModal";
import PaywallModal from "@/components/PaywallModal";
import type { CardIdentificationResult, GradeEstimate, WorthGradingResult } from "@/types";

export default function GradeEstimatorPage() {
  const [identifiedCard, setIdentifiedCard] = useState<CardIdentificationResult | null>(null);
  const [gradeEstimate, setGradeEstimate] = useState<GradeEstimate | null>(null);
  const [estimatingGrade, setEstimatingGrade] = useState(false);
  const [valueResult, setValueResult] = useState<WorthGradingResult | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleReset = () => {
    setIdentifiedCard(null);
    setGradeEstimate(null);
    setEstimatingGrade(false);
    setValueResult(null);
    setValueLoading(false);
  };

  const handleEstimateGrade = async () => {
    if (!identifiedCard?.imageUrl) return;
    
    setEstimatingGrade(true);
    try {
      const response = await fetch("/api/grade-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: identifiedCard.imageUrl }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to estimate grade");
      }
      
      const estimate: GradeEstimate = await response.json();
      setGradeEstimate(estimate);
    } catch (err) {
      setToast({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to estimate grade",
      });
    } finally {
      setEstimatingGrade(false);
    }
  };

  useEffect(() => {
    const fetchValue = async () => {
      if (!gradeEstimate?.grade_probabilities || !identifiedCard) return;
      setValueLoading(true);
      try {
        const response = await fetch("/api/grade-estimator/value", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            card: {
              player_name: identifiedCard.player_name,
              year: identifiedCard.year,
              set_name: identifiedCard.set_name,
              card_number: identifiedCard.card_number,
              parallel_type: identifiedCard.parallel_type,
              variation: identifiedCard.variation,
              insert: identifiedCard.insert,
            },
            gradeProbabilities: gradeEstimate.grade_probabilities,
            estimatorConfidence: gradeEstimate.grade_probabilities.confidence,
          }),
        });
        if (!response.ok) {
          throw new Error("Failed to load post-grading value");
        }
        const result: WorthGradingResult = await response.json();
        setValueResult(result);
      } catch (error) {
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to load post-grading value",
        });
      } finally {
        setValueLoading(false);
      }
    };

    fetchValue();
  }, [gradeEstimate, identifiedCard]);

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
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={handleEstimateGrade}
                      disabled={estimatingGrade || !!gradeEstimate || !!identifiedCard.grade}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {estimatingGrade ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Estimating...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Estimate Grade
                        </>
                      )}
                    </button>
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
            {gradeEstimate ? (
              <div className="space-y-6">
                <GradeEstimateDisplay estimate={gradeEstimate} />
                {valueLoading || valueResult ? (
                  <GradeEstimatorValuePanel
                    result={
                      valueResult ?? {
                        raw: { price: null, n: 0, method: "none" },
                        psa: {
                          "10": { price: null, n: 0, method: "none" },
                          "9": { price: null, n: 0, method: "none" },
                          "8": { price: null, n: 0, method: "none" },
                          ev: 0,
                          netGain: 0,
                          roi: 0,
                        },
                        bgs: {
                          "9.5": { price: null, n: 0, method: "none" },
                          "9": { price: null, n: 0, method: "none" },
                          "8.5": { price: null, n: 0, method: "none" },
                          ev: 0,
                          netGain: 0,
                          roi: 0,
                        },
                        bestOption: "none",
                        rating: "no",
                        confidence: "low",
                        explanation: "Loading post-grading value...",
                      }
                    }
                    loading={valueLoading}
                  />
                ) : null}
              </div>
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
