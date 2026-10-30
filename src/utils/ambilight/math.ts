function erf(x: number): number {
  const sign = Math.sign(x)
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return sign * y
}

// CSS blur() 的参数即高斯标准差；画布矩形模糊后在某点的覆盖率为两个方向 erf 之差的乘积。
export function blurredCoverage(position: number, start: number, end: number, sigma: number): number {
  const scale = sigma * Math.SQRT2
  return 0.5 * (erf((end - position) / scale) - erf((start - position) / scale))
}

// 优化时间常数：兼顾丝滑过渡与明暗剧变时的快速追随。
export function blendAlpha(dt: number, smoothing: number): number {
  return smoothing === 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / (20 + smoothing * 4.2))
}
