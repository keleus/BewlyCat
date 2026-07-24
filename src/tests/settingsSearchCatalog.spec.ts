import { describe, expect, it } from 'vitest'

import {
  settingsSearchEntries,
  topBarElementStorageKey,
} from '~/components/Settings/searchCatalog'
import { MenuType } from '~/components/Settings/types'

describe('settings search catalog', () => {
  it('covers every primary settings menu', () => {
    const coveredMenus = new Set(settingsSearchEntries.map(entry => entry.menu))

    expect(coveredMenus).toEqual(new Set(Object.values(MenuType)))
  })

  it('routes top bar switcher settings to their exact configuration panel', () => {
    const entry = settingsSearchEntries.find(
      item => item.titleKey === 'settings.show_bewly_or_bili_page_switcher',
    )

    expect(entry).toBeDefined()
    expect(entry?.storageValues).toEqual(expect.arrayContaining([
      { key: 'bewly-settings-navigation-page', value: 'topbar' },
      { key: topBarElementStorageKey, value: 'switchers' },
    ]))
  })

  it('gives every entry a searchable title', () => {
    expect(settingsSearchEntries.every(entry => entry.titleKey || entry.title)).toBe(true)
  })
})
