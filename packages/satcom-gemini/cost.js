export function estimateCost(registry, { model, inputTokens = 0, outputTokens = 0, videoSeconds = 0, resolution = '1080p' }) {
  const price = registry.pricing?.[model];
  if (!price) return { estimatedUsd: 0, note: 'No price row for this model.' };
  let usd = 0;
  if (price.inputPer1MUsd) usd += (Number(inputTokens) || 0) / 1_000_000 * price.inputPer1MUsd;
  const textOut = price.outputPer1MUsd ?? price.outputTextPer1MUsd;
  if (textOut && !videoSeconds) usd += (Number(outputTokens) || 0) / 1_000_000 * textOut;
  if (price.approxUsdPerSecond720p && videoSeconds) {
    usd += Number(videoSeconds) * price.approxUsdPerSecond720p;
  } else if (price.usdPerSecond && videoSeconds) {
    const rate = price.usdPerSecond[resolution] ?? price.usdPerSecond['720p'] ?? 0;
    usd += Number(videoSeconds) * rate;
  } else if (price.outputVideoPer1MUsd && (outputTokens || videoSeconds)) {
    const tokens = outputTokens || (videoSeconds * (price.videoTokensPerSecond720p || 5792));
    usd += tokens / 1_000_000 * price.outputVideoPer1MUsd;
  }
  return { estimatedUsd: Math.round(usd * 1e6) / 1e6, note: price.note || null };
}

export function usageFromGenerateContent(data) {
  const meta = data?.usageMetadata || {};
  return {
    inputTokens: Number(meta.promptTokenCount) || 0,
    outputTokens: Number(meta.candidatesTokenCount) || 0,
    totalTokens: Number(meta.totalTokenCount) || 0,
  };
}

export function usageFromInteraction(data) {
  const usage = data?.usage || {};
  return {
    inputTokens: Number(usage.input_tokens ?? usage.promptTokenCount) || 0,
    outputTokens: Number(usage.output_tokens ?? usage.candidatesTokenCount) || 0,
    totalTokens: Number(usage.total_tokens ?? usage.totalTokenCount) || 0,
  };
}
