import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContentScriptRecoveryBrowser } from '~/background/contentScriptRecovery'
import { recoverContentScript } from '~/background/contentScriptRecovery'
import { CONTENT_SCRIPT_PONG } from '~/constants/contentScript'

vi.mock('webextension-polyfill', () => ({
  default: {
    scripting: {},
    tabs: {},
  },
}))

const eligibleTab = {
  active: true,
  status: 'complete',
  url: 'https://www.bilibili.com/',
}

function createExtensionApi() {
  const tabs = {
    get: vi.fn(),
    sendMessage: vi.fn(),
  }
  const scripting = {
    executeScript: vi.fn(),
    insertCSS: vi.fn(),
  }

  return {
    extensionApi: { tabs, scripting } as unknown as ContentScriptRecoveryBrowser,
    scripting,
    tabs,
  }
}

describe('content script recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not inject when the manifest content script responds', async () => {
    const { extensionApi, scripting, tabs } = createExtensionApi()
    tabs.get.mockResolvedValue(eligibleTab)
    tabs.sendMessage.mockResolvedValue(CONTENT_SCRIPT_PONG)

    await expect(recoverContentScript(7, extensionApi)).resolves.toBe('already-injected')
    expect(tabs.sendMessage).toHaveBeenCalledWith(7, expect.anything(), { frameId: 0 })
    expect(scripting.insertCSS).not.toHaveBeenCalled()
    expect(scripting.executeScript).not.toHaveBeenCalled()
  })

  it('restores CSS and both script worlds when the receiver is missing', async () => {
    const { extensionApi, scripting, tabs } = createExtensionApi()
    tabs.get.mockResolvedValue(eligibleTab)
    tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'))

    await expect(recoverContentScript(11, extensionApi)).resolves.toBe('injected')

    expect(tabs.get).toHaveBeenCalledTimes(2)
    expect(tabs.sendMessage).toHaveBeenCalledTimes(2)
    expect(scripting.insertCSS).toHaveBeenCalledWith({
      target: { tabId: 11, frameIds: [0] },
      files: ['dist/contentScripts/style.css'],
    })
    expect(scripting.executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 11, frameIds: [0] },
      files: ['dist/contentScripts/index.global.js'],
      world: 'ISOLATED',
      injectImmediately: true,
    })
    expect(scripting.executeScript).toHaveBeenNthCalledWith(2, {
      target: { tabId: 11, frameIds: [0] },
      files: ['dist/contentScripts/inject.global.js'],
      world: 'MAIN',
      injectImmediately: true,
    })
  })

  it('allows a normal manifest injection to finish before recovering', async () => {
    const { extensionApi, scripting, tabs } = createExtensionApi()
    tabs.get.mockResolvedValue(eligibleTab)
    tabs.sendMessage
      .mockRejectedValueOnce(new Error('Receiver is still starting'))
      .mockResolvedValueOnce(CONTENT_SCRIPT_PONG)

    await expect(recoverContentScript(12, extensionApi)).resolves.toBe('already-injected')
    expect(tabs.sendMessage).toHaveBeenCalledTimes(2)
    expect(scripting.insertCSS).not.toHaveBeenCalled()
    expect(scripting.executeScript).not.toHaveBeenCalled()
  })

  it('does not inject into an ineligible active tab', async () => {
    const { extensionApi, scripting, tabs } = createExtensionApi()
    tabs.get.mockResolvedValue({
      active: true,
      status: 'complete',
      url: 'https://example.com/',
    })

    await expect(recoverContentScript(13, extensionApi)).resolves.toBe('ineligible')
    expect(tabs.sendMessage).not.toHaveBeenCalled()
    expect(scripting.insertCSS).not.toHaveBeenCalled()
  })

  it('stops if the tab starts navigating after a failed ping', async () => {
    const { extensionApi, scripting, tabs } = createExtensionApi()
    tabs.get
      .mockResolvedValueOnce(eligibleTab)
      .mockResolvedValueOnce({ ...eligibleTab, status: 'loading' })
    tabs.sendMessage.mockRejectedValue(new Error('Tab navigated'))

    await expect(recoverContentScript(17, extensionApi)).resolves.toBe('ineligible')
    expect(scripting.insertCSS).not.toHaveBeenCalled()
    expect(scripting.executeScript).not.toHaveBeenCalled()
  })
})
