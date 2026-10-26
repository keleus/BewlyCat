export function normalizeWheelVolumeStep(value: unknown): number {
  const step = typeof value === 'number' && Number.isFinite(value) ? value : 5
  return Math.round(Math.max(1, Math.min(50, step)))
}
