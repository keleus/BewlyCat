import { describe, expect, it, vi } from 'vitest'

import API_AUTH from '~/background/messageListeners/api/auth'
import { AHS } from '~/background/utils'

vi.mock('webextension-polyfill', () => ({
  default: {},
}))

describe('auth API message responses', () => {
  it('uses promise-compatible JSON handlers', () => {
    for (const api of Object.values(API_AUTH)) {
      expect(api.afterHandle).toBe(AHS.J_D)
      expect(api.afterHandle).not.toContain(AHS.J_S.at(-1))
    }
  })
})
