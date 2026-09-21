import browser from 'webextension-polyfill'

import { isTrialVipQualityEnabled, TRIAL_STREAM_URL_REGEX_SOURCE, TRIAL_STREAM_USER_AGENT } from '~/utils/trialQualityProtocol'

const TRIAL_VIP_QUALITY_RULE_ID = 1002
// eslint-disable-next-line node/prefer-global/process
const isFirefoxBuild = Boolean(process.env.FIREFOX)
let enabled = false
let revision = 0
let queue = Promise.resolve(false)
let initialized: Promise<boolean> | undefined

const rule: browser.DeclarativeNetRequest.Rule = {
  id: TRIAL_VIP_QUALITY_RULE_ID,
  priority: 1,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [
      { header: 'referer', operation: 'remove' },
      { header: 'user-agent', operation: 'set', value: TRIAL_STREAM_USER_AGENT },
    ],
  },
  condition: {
    regexFilter: TRIAL_STREAM_URL_REGEX_SOURCE,
    resourceTypes: ['xmlhttprequest', 'media', 'other'],
  },
}

function syncRule(): Promise<boolean> {
  // 串行更新，防止快速开关导致较早的操作最后完成。
  queue = queue.then(async () => {
    const desired = enabled
    if (!isFirefoxBuild) {
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [TRIAL_VIP_QUALITY_RULE_ID],
        addRules: desired ? [rule] : [],
      })
    }
    return desired && enabled
  }).catch(() => {
    console.warn('[BewlyCat] 会员画质试用请求头规则更新失败')
    return false
  })
  return queue
}

export function setupTrialQualityHeaders(): Promise<boolean> {
  if (initialized)
    return initialized
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.settings)
      return
    revision++
    const next = isTrialVipQualityEnabled(changes.settings.newValue)
    if (next !== enabled) {
      enabled = next
      void syncRule()
    }
  })
  const initialRevision = revision
  initialized = browser.storage.local.get('settings').then((result) => {
    if (initialRevision === revision)
      enabled = isTrialVipQualityEnabled(result.settings)
    return syncRule()
  }).catch(() => false)
  return initialized
}

export async function ensureTrialStreamHeaderRule(): Promise<boolean> {
  await setupTrialQualityHeaders()
  // service worker 恢复后及更新失败后重试，取流必须等规则确实可用。
  return syncRule()
}

export function isTrialQualityHeaderEnabled(): boolean {
  return enabled
}
