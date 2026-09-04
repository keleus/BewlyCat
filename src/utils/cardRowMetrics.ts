/** Prefix sums of row heights, including the gap after each row. */
export class CardRowMetrics {
  private tree = new Float64Array(1)
  private heights: number[] = []

  reset(heights: number[]) {
    this.heights = heights
    this.tree = new Float64Array(heights.length + 1)
    for (let index = 1; index < this.tree.length; index++) {
      this.tree[index] += heights[index - 1]
      const parent = index + (index & -index)
      if (parent < this.tree.length)
        this.tree[parent] += this.tree[index]
    }
  }

  set(row: number, height: number): boolean {
    const previous = this.heights[row]
    if (previous === undefined || Math.abs(previous - height) < 0.5)
      return false
    this.heights[row] = height
    for (let index = row + 1; index < this.tree.length; index += index & -index)
      this.tree[index] += height - previous
    return true
  }

  offset(row: number): number {
    let result = 0
    for (let index = Math.min(row, this.heights.length); index > 0; index -= index & -index)
      result += this.tree[index]
    return result
  }

  /** Find a row in O(log n), without scanning the previously loaded feed. */
  rowAt(offset: number): number {
    let row = 0
    let sum = 0
    let step = 1
    while (step * 2 <= this.heights.length)
      step *= 2
    for (; step > 0; step = Math.floor(step / 2)) {
      const next = row + step
      if (next < this.tree.length && sum + this.tree[next] <= offset) {
        row = next
        sum += this.tree[next]
      }
    }
    return Math.min(row, Math.max(0, this.heights.length - 1))
  }
}
