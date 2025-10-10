export interface ApiError extends Error {
  code: number
  isRiskControl?: boolean
  originalError?: string
}

export function isApiError(error: any): error is ApiError {
  return error instanceof Error && 'code' in error && (error as any).code < 0
}

export function isRiskControlError(error: any): error is ApiError {
  return isApiError(error) && error.isRiskControl === true
}
