export function normalizePlaybackRate(value: unknown): number {
  const rate = typeof value === 'number' && Number.isFinite(value) ? value : 1
  return Math.round(Math.max(0.25, Math.min(5, rate)) * 100) / 100
}

export function normalizePlaybackRateStep(value: unknown): number {
  const step = typeof value === 'number' && Number.isFinite(value) ? value : 0.25
  return Math.round(Math.max(0.01, Math.min(1, step)) * 100) / 100
}
