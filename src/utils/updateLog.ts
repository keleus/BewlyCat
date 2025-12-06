import browser from 'webextension-polyfill'

/**
 * Build info interface (generated at build time)
 */
interface BuildInfo {
  buildHash: string
  buildTime: number
}

/**
 * Get the dev build hash from build-info.json
 * This file is generated at build time by the build script
 */
async function getDevBuildHash(): Promise<string> {
  try {
    // Try to fetch the build-info.json file that was generated during build
    const response = await fetch(browser.runtime.getURL('/dist/build-info.json'))
    if (!response.ok) {
      console.warn('[UpdateLog] build-info.json not found, using fallback')
      return 'dev'
    }

    const buildInfo: BuildInfo = await response.json()
    return buildInfo.buildHash
  }
  catch (error) {
    console.error('[UpdateLog] Failed to read build-info.json:', error)
    return 'dev'
  }
}

/**
 * Get the current extension version from manifest
 * For dev builds, append the dev build hash
 */
export async function getExtensionVersion(): Promise<string> {
  try {
    const manifest = browser.runtime.getManifest()
    const baseVersion = manifest.version

    // Check if this is a dev build (name contains "Dev")
    const isDevBuild = manifest.name?.includes('Dev')

    if (isDevBuild) {
      const devHash = await getDevBuildHash()
      return `${baseVersion}-dev.${devHash}`
    }

    return baseVersion
  }
  catch (error) {
    console.error('[UpdateLog] Failed to get extension version:', error)
    return ''
  }
}

/**
 * Check if we should show the update log dialog
 * @param lastReadVersion - The last version that user has read
 * @param currentVersion - The current extension version
 * @returns true if we should show the dialog
 */
export function shouldShowUpdateLog(lastReadVersion: string, currentVersion: string): boolean {
  // If user has never read any version, show the dialog
  if (!lastReadVersion)
    return true

  // If versions are different, show the dialog
  return lastReadVersion !== currentVersion
}

/**
 * Get the changelog URL from package.json
 */
export async function getChangelogUrl(): Promise<string> {
  try {
    // Try to get changelog URL from package.json at build time
    const pkg = await import('../../package.json')
    return pkg.changelog || pkg.homepage || 'https://github.com/keleus/BewlyCat/releases'
  }
  catch (error) {
    console.error('Failed to get changelog URL:', error)
    return 'https://github.com/keleus/BewlyCat/releases'
  }
}
