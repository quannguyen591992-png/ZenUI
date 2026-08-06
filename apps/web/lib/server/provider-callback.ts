const callbackStatePattern = /^[A-Za-z0-9_-]{43}$/

export function isMisroutedVercelCallback(input: Record<string, string | string[] | undefined>): boolean {
  return typeof input.state === 'string'
    && callbackStatePattern.test(input.state)
    && typeof input.code === 'string'
    && input.code.length > 0
    && input.code.length <= 500
    && typeof input.configurationId === 'string'
    && input.configurationId.length > 0
    && input.configurationId.length <= 200
    && (input.teamId === undefined || typeof input.teamId === 'string')
    && input.source === 'external'
}
