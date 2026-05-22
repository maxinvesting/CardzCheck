"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string; format?: string }>>;
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorCtor;
  }
}

interface CertBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called for every newly detected cert number (deduped). */
  onCertDetected: (cert: string) => void;
}

function normalizeCert(raw: string): string {
  return raw.trim().replace(/\D/g, "");
}

export default function CertBarcodeScanner({
  isOpen,
  onClose,
  onCertDetected,
}: CertBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [detectedCerts, setDetectedCerts] = useState<string[]>([]);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    detectorRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    stop();
    setDetectedCerts([]);
    seenRef.current = new Set();
    setErrorMessage(null);
    onClose();
  }, [onClose, stop]);

  useEffect(() => {
    if (!isOpen) return;

    const Detector = window.BarcodeDetector;
    if (!Detector) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    let cancelled = false;

    async function start() {
      try {
        // Prefer formats common on PSA slabs (Code128 / QR / Code 39).
        let formats: string[] | undefined;
        try {
          const supported = (await Detector!.getSupportedFormats?.()) ?? [];
          formats = ["code_128", "code_39", "qr_code", "ean_13"].filter((f) =>
            supported.includes(f)
          );
          if (formats.length === 0) formats = undefined;
        } catch {
          formats = undefined;
        }

        const detector = new Detector!({ formats });
        detectorRef.current = detector;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const tick = async () => {
          if (cancelled || !videoRef.current || !detectorRef.current) return;
          try {
            const results = await detectorRef.current.detect(videoRef.current);
            for (const r of results) {
              const cert = normalizeCert(r.rawValue);
              if (cert.length >= 5 && !seenRef.current.has(cert)) {
                seenRef.current.add(cert);
                setDetectedCerts((prev) => [...prev, cert]);
                onCertDetected(cert);
              }
            }
          } catch {
            // Per-frame detect errors are non-fatal.
          }
          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Could not access camera. Check permissions."
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [isOpen, onCertDetected, stop]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-[#0F1317] text-[#E6E8EB] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#24282D] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Scan PSA cert barcode</h3>
            <p className="text-[11px] text-[#77808C]">
              Point the camera at the slab barcode/QR. Detected certs are added below.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-[#77808C] hover:bg-[#1E2227] hover:text-[#E6E8EB]"
            aria-label="Close scanner"
          >
            ×
          </button>
        </header>

        <div className="p-3">
          {isSupported === false ? (
            <div className="rounded-md border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-200">
              Barcode scanning isn&apos;t supported in this browser. Try Chrome, Edge,
              or Safari (iOS 17+). You can still paste cert numbers manually.
            </div>
          ) : (
            <div className="relative aspect-video w-full overflow-hidden rounded-md border border-[#24282D] bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 border-2 border-emerald-400/40" />
            </div>
          )}

          {errorMessage ? (
            <div className="mt-2 rounded-md border border-red-700 bg-red-950/40 p-2 text-[11px] text-red-200">
              {errorMessage}
            </div>
          ) : null}

          {detectedCerts.length > 0 ? (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                Detected ({detectedCerts.length})
              </div>
              <ul className="mt-1 max-h-32 overflow-y-auto font-mono text-[12px] text-[#E6E8EB]">
                {detectedCerts.map((c) => (
                  <li key={c} className="border-b border-[#24282D] py-0.5">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#24282D] bg-[#0B0D0F] px-4 py-3">
          <button
            type="button"
            onClick={handleClose}
            className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] hover:bg-[#33C47C]"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
