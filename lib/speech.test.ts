import { describe, expect, it } from "vitest";
import { appendSpeechTranscript } from "@/lib/speech";

describe("appendSpeechTranscript", () => {
  it("uses the transcript as-is when the field is empty", () => {
    expect(appendSpeechTranscript("", "Victor Wembanyama")).toBe("Victor Wembanyama");
  });

  it("appends inline transcripts with a separating space", () => {
    expect(appendSpeechTranscript("2023 Prizm", "Victor Wembanyama Silver #136")).toBe(
      "2023 Prizm Victor Wembanyama Silver #136"
    );
  });

  it("appends multiline transcripts on a new line", () => {
    expect(
      appendSpeechTranscript("Possible scratch near top edge.", "Centering looks left heavy.", "newline")
    ).toBe("Possible scratch near top edge.\nCentering looks left heavy.");
  });
});
