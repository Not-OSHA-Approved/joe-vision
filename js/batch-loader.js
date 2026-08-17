"use strict";

(() => {
  const originalFetch = window.fetch.bind(window);
  const primaryCandidatePath = "data/candidates-2026-07.json";
  const additionalCandidatePaths = [
    "data/candidates-2026-07-batch-2.json",
    "data/candidates-2026-08.json"
  ];

  window.fetch = async (input, init) => {
    const requestedUrl = typeof input === "string" ? input : input?.url;
    if (!requestedUrl || !requestedUrl.endsWith(primaryCandidatePath)) {
      return originalFetch(input, init);
    }

    const [primaryResponse, ...additionalResponses] = await Promise.all([
      originalFetch(input, init),
      ...additionalCandidatePaths.map(path => originalFetch(path, init))
    ]);

    if (!primaryResponse.ok) return primaryResponse;

    const primaryData = await primaryResponse.json();
    const additionalData = [];

    for (let i = 0; i < additionalResponses.length; i += 1) {
      const response = additionalResponses[i];
      if (!response.ok) {
        console.warn(`JOE VISION candidate batch ${additionalCandidatePaths[i]} returned HTTP ${response.status}.`);
        continue;
      }
      additionalData.push(await response.json());
    }

    const latestBatch = additionalData[additionalData.length - 1];
    const merged = {
      ...primaryData,
      metadata: {
        ...(primaryData.metadata || {}),
        additionalBatches: additionalData.map(data => data.metadata?.batch || "unknown"),
        updated: latestBatch?.metadata?.updated || primaryData.metadata?.updated
      },
      properties: [
        ...(primaryData.properties || []),
        ...additionalData.flatMap(data => data.properties || [])
      ]
    };

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
})();
