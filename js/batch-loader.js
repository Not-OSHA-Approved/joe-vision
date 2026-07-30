"use strict";

(() => {
  const originalFetch = window.fetch.bind(window);
  const primaryCandidatePath = "data/candidates-2026-07.json";
  const secondCandidatePath = "data/candidates-2026-07-batch-2.json";

  window.fetch = async (input, init) => {
    const requestedUrl = typeof input === "string" ? input : input?.url;
    if (!requestedUrl || !requestedUrl.endsWith(primaryCandidatePath)) {
      return originalFetch(input, init);
    }

    const [primaryResponse, secondResponse] = await Promise.all([
      originalFetch(input, init),
      originalFetch(secondCandidatePath, init)
    ]);

    if (!primaryResponse.ok) return primaryResponse;
    if (!secondResponse.ok) {
      console.warn(`JOE VISION second candidate batch returned HTTP ${secondResponse.status}.`);
      return primaryResponse;
    }

    const primaryData = await primaryResponse.json();
    const secondData = await secondResponse.json();
    const merged = {
      ...primaryData,
      metadata: {
        ...(primaryData.metadata || {}),
        additionalBatch: secondData.metadata?.batch || "unknown",
        updated: secondData.metadata?.updated || primaryData.metadata?.updated
      },
      properties: [
        ...(primaryData.properties || []),
        ...(secondData.properties || [])
      ]
    };

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
})();
