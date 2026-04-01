"use client";

/**
 * /grade-report/print — server-print page for PDF export.
 *
 * Flow:
 *   1. GradeProbabilityPanel stores serialized report data in sessionStorage
 *      under the key "cc_grade_report_data".
 *   2. It opens this page in a new window (900 × 1200).
 *   3. This page reads sessionStorage, renders GradeReportPrint, then calls
 *      window.print() so the user gets the browser's native print / Save as PDF dialog.
 *   4. The page title and @media print styles ensure a clean A4/Letter output.
 */

import { useEffect, useState } from "react";
import { GradeReportPrint, type GradeReportPrintProps } from "@/components/grading/GradeReportPrint";

const SESSION_KEY = "cc_grade_report_data";

type StoredReportData = GradeReportPrintProps & { slabId?: string };

export default function GradeReportPrintPage() {
  const [data, setData] = useState<StoredReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) {
        setError("No report data found. Please export from the Grade Probability panel.");
        return;
      }
      const parsed = JSON.parse(raw) as StoredReportData;
      setData(parsed);
    } catch {
      setError("Failed to load report data.");
    }
  }, []);

  // Trigger print once the report data is rendered
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      window.print();
    }, 600);
    return () => clearTimeout(timer);
  }, [data]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          color: "#64748B",
          fontSize: 14,
          padding: 40,
          textAlign: "center",
        }}
      >
        <p>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          color: "#94A3B8",
          fontSize: 13,
        }}
      >
        Loading report…
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4;
            margin: 0;
          }
        }
        body {
          margin: 0;
          padding: 0;
          background: #f1f5f9;
        }
      `}</style>

      {/* Print hint bar — hidden during actual print */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: "#1E293B",
          color: "#E2E8F0",
          padding: "10px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
        }}
      >
        <span>CardzCheck Grade Report — ready to print</span>
        <button
          onClick={() => window.print()}
          style={{
            padding: "5px 14px",
            borderRadius: 6,
            backgroundColor: "#3B82F6",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Report content — centered with top margin to clear the hint bar in browser view */}
      <div
        style={{
          paddingTop: 52,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            borderRadius: 4,
          }}
        >
          <GradeReportPrint
            estimate={data.estimate}
            cardIdentity={data.cardIdentity}
            primaryImageUrl={data.primaryImageUrl}
            imageUrls={data.imageUrls}
            generatedAt={data.generatedAt}
            slabId={data.slabId}
          />
        </div>
      </div>
    </>
  );
}
