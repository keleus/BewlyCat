export function calculateRelativeSeekTime(
  startPlaybackTime: number,
  deltaX: number,
  gestureWidth: number,
  duration: number,
): number {
  return Math.min(duration, Math.max(0, startPlaybackTime + deltaX / gestureWidth * duration))
}
