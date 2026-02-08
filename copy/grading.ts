export const gradingCopy = {
  page: {
    title: "Grade Probability Engine",
    subtitle:
      "Upload a photo of your card to get an AI-based condition estimate mapped to PSA-style outcomes (not guaranteed).",
    howItWorks: {
      title: "How it works",
      steps: [
        "Upload a clear, well-lit photo of your raw (ungraded) card",
        "Our AI analyzes centering, corners, surface, and edges",
        "Get an AI-based condition estimate mapped to PSA-style outcomes (not guaranteed)",
      ],
    },
  },
  actions: {
    analyze: "Analyze Grade Probabilities",
    analyzing: "Analyzing...",
    addToCollection: "Add to Collection",
    uploadNewCard: "Upload New Card",
  },
  status: {
    alreadyGradedTitle: "Already Graded",
    alreadyGradedBody: (grade: string) => `This card is already graded: ${grade}`,
    confidenceLabels: {
      high: "High confidence",
      medium: "Medium confidence",
      low: "Low confidence",
    },
    estimateUnavailableTitle: "Grade Probability Unavailable",
    estimateUnavailableBody:
      "Could not estimate grade probabilities. Try uploading a clearer image with better lighting.",
    estimateFailedFallback: "Failed to analyze grade probabilities",
    postGradingValueFailed: "Market impact is unavailable right now. Try again in a moment.",
    postGradingValueLoading: "Loading post-grading value...",
  },
  panel: {
    title: "AI Grade Probability",
    mostLikelyLabel: "Most likely outcome (probability)",
    expectedValueLabel: "Expected grade (EV)",
    expectedValueHelp:
      "EV represents the probability-weighted average grade outcome.",
    rangeLabel: "Estimated range (PSA-style)",
    distributionTitle: "Probability Distribution",
    psaTitle: "PSA-style outcomes (mapped to PSA standards)",
    bgsTitle: "BGS outcomes",
    bgsUnavailable: "BGS distribution unavailable",
    evidenceTitle: "Evidence (from photos)",
    evidenceNote:
      "These factors most strongly influence the probability distribution above.",
    evidenceLabels: {
      centering: "Centering",
      corners: "Corners",
      surface: "Surface",
      edges: "Edges",
    },
    notesLabel: "Notes",
    warnings: {
      parse_error:
        "We had trouble reading the AI response, so this is a conservative probability estimate.",
      low_confidence:
        "Low confidence: probabilities are more conservative due to limited visual signal.",
      unable:
        "Unable to fully assess from the photos; showing a conservative probability estimate.",
    },
    disclaimer:
      "Estimates are based on photos and may miss defects not visible in images. Final grades are determined by grading companies.",
    confidenceReduced: "Confidence reduced due to photo quality.",
  },
  valuePanel: {
    marketAnalysisLabel: "Market Analysis",
    showMarketImpact: "Show market impact",
    hideMarketImpact: "Hide market impact",
    title: "Post-Grading Value",
    bestLabel: "Best",
    roiBadge: (level: "High" | "Medium" | "Low") =>
      `Grading ROI: ${level} (market-dependent)`,
    rawTitle: "Raw CMV",
    psaTitle: "PSA CMV",
    bgsTitle: "BGS CMV",
    insufficientComps: "Insufficient comps",
    compsSuffix: "comps",
    evLabel: "EV",
    netLabel: "Net",
    roiLabel: "ROI",
    confidenceNote: "Based on recent sold comps; low comp volume reduces confidence.",
  },
  toast: {
    addedToCollection: (playerName: string) => `Added ${playerName} to collection!`,
  },
};
