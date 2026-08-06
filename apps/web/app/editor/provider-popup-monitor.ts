export const PROVIDER_POPUP_POLL_INTERVAL_MS = 250
export const PROVIDER_POPUP_MAX_ATTEMPTS = 240

export type ProviderPopupState = 'pending' | 'connected' | 'misconfigured' | 'closed'

export function inspectProviderPopup(
  popup: Window,
  appOrigin: string,
  returnPath: string,
): ProviderPopupState {
  if (popup.closed) return 'closed'
  try {
    const location = new URL(popup.location.href)
    if (location.origin !== new URL(appOrigin).origin) return 'pending'
    if (location.pathname === returnPath && location.searchParams.get('provider') === 'connected') return 'connected'
    if (location.pathname === '/provider-callback-error') return 'misconfigured'
    if (
      location.pathname === '/'
      && location.searchParams.get('source') === 'external'
      && location.searchParams.has('state')
      && location.searchParams.has('code')
      && location.searchParams.has('configurationId')
    ) return 'misconfigured'
    return 'pending'
  } catch {
    return 'pending'
  }
}
