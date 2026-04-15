"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type SpeechRecognitionErrorCode =
  | "aborted"
  | "audio-capture"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed"
  | string;

function mapSpeechRecognitionError(code: SpeechRecognitionErrorCode): string {
  switch (code) {
    case "aborted":
      return "Voice input was stopped.";
    case "audio-capture":
      return "No microphone was found. Check your mic connection and browser permissions.";
    case "network":
      return "Voice input hit a network error. Try again.";
    case "no-speech":
      return "No speech was detected. Try again and speak clearly.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow microphone permissions in your browser and try again.";
    default:
      return "Voice input failed. Try again.";
  }
}

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const manualStopRef = useRef(false);

  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    recognitionRef.current?.stop?.();
    setIsListening(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const startListening = useCallback(
    async (onResult: (text: string) => void, onError?: (err: string) => void) => {
      if (!isSupported) {
        const message = "Voice input is not supported in this browser.";
        setError(message);
        onError?.(message);
        return;
      }

      setError(null);
      manualStopRef.current = false;

      try {
        if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        }
      } catch {
        const message =
          "Microphone access is blocked. Allow microphone permissions in your browser and try again.";
        setError(message);
        onError?.(message);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recognition: any = new SR();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      let heardAnything = false;
      let finalTranscript = "";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        heardAnything = true;
        finalTranscript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (result?.isFinal && result[0]?.transcript) {
            finalTranscript += `${result[0].transcript} `;
          }
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        const message = mapSpeechRecognitionError(event.error);
        if (!manualStopRef.current || event.error !== "aborted") {
          setError(message);
          onError?.(message);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        const transcript = finalTranscript.trim();
        if (transcript) {
          onResult(transcript);
        } else if (!manualStopRef.current && !heardAnything) {
          const message = mapSpeechRecognitionError("no-speech");
          setError(message);
          onError?.(message);
        }
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    },
    [isSupported]
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
    };
  }, []);

  return { isListening, isSupported, error, clearError, startListening, stopListening };
}
