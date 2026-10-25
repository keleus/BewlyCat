import { CardRowMetrics } from './cardRowMetrics'

/** Indexed heights for one masonry column. Rebuild only when its items change. */
export class MasonryColumnMetrics {
  private metrics = new CardRowMetrics()
  private count = 0
  private gap = 0

  reset(heights: number[], gap: number) {
    this.count = heights.length
    this.gap = gap
    this.metrics.reset(heights.map(height => height + gap))
  }

  set(index: number, height: number) {
    return this.metrics.set(index, height + this.gap)
  }

  /** Top of the card at index, relative to the column top. */
  offsetOf(index: number) {
    return this.metrics.offset(index)
  }

  /** Height of the card at index, excluding the gap below it. */
  heightOf(index: number) {
    return this.metrics.offset(index + 1) - this.metrics.offset(index) - this.gap
  }

  /** Inclusive viewport edges match the card intersection test, excluding gaps. */
  getWindow(viewStart: number, viewEnd: number) {
    let start = this.count ? this.metrics.rowAt(Math.max(0, viewStart)) : 0
    if (start > 0 && this.metrics.offset(start) - this.gap >= viewStart)
      start--
    if (start < this.count && this.metrics.offset(start + 1) - this.gap < viewStart)
      start++
    const end = viewEnd < 0 || !this.count
      ? 0
      : Math.min(this.count, this.metrics.rowAt(viewEnd) + 1)

    return {
      start,
      end,
      // CSS supplies the gap between spacers and their neighboring cards.
      topPad: Math.max(0, this.metrics.offset(start) - this.gap),
      bottomPad: Math.max(0, this.metrics.offset(this.count) - this.metrics.offset(end) - this.gap),
    }
  }
}
