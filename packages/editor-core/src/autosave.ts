import type { DesignCommand } from '@zenui/design-commands'

export type AutosaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict'

export interface AutosaveState {
  status: AutosaveStatus
  serverVersion: number
  pending: DesignCommand[][]
  inFlight: { requestId: string; commands: DesignCommand[] } | null
  nextRequestId: number
  recoveryRequired: boolean
}

export interface AutosaveRequest {
  requestId: string
  expectedVersion: number
  commands: DesignCommand[]
}

export type AutosaveResolution =
  | { requestId: string; accepted: true; version: number }
  | {
      requestId: string
      accepted: false
      code: 'stale_document_version' | 'offline' | 'unauthorized' | 'forbidden' | 'validation_error' | 'server_error'
      currentVersion?: number
    }

export function createAutosaveState(serverVersion: number): AutosaveState {
  return {
    status: 'idle',
    serverVersion,
    pending: [],
    inFlight: null,
    nextRequestId: 1,
    recoveryRequired: false,
  }
}

export function queueAutosave(state: AutosaveState, commands: readonly DesignCommand[]): AutosaveState {
  if (commands.length === 0) return state
  return {
    ...state,
    status: state.inFlight ? 'saving' : 'dirty',
    pending: [...state.pending, [...commands]],
    recoveryRequired: true,
  }
}

export function startAutosave(state: AutosaveState): { state: AutosaveState; request: AutosaveRequest | null } {
  if (state.inFlight || state.pending.length === 0 || state.status === 'conflict') {
    return { state, request: null }
  }
  const commands = state.pending[0]!
  const requestId = `autosave-${state.nextRequestId}`
  return {
    state: {
      ...state,
      status: 'saving',
      pending: state.pending.slice(1),
      inFlight: { requestId, commands },
      nextRequestId: state.nextRequestId + 1,
    },
    request: { requestId, expectedVersion: state.serverVersion, commands },
  }
}

export function resolveAutosave(state: AutosaveState, resolution: AutosaveResolution): AutosaveState {
  if (!state.inFlight || state.inFlight.requestId !== resolution.requestId) return state
  const failedCommands = state.inFlight.commands
  if (resolution.accepted) {
    return {
      ...state,
      status: state.pending.length > 0 ? 'dirty' : 'saved',
      serverVersion: resolution.version,
      inFlight: null,
      recoveryRequired: state.pending.length > 0,
    }
  }

  const pending = [failedCommands, ...state.pending]
  if (resolution.code === 'stale_document_version') {
    return {
      ...state,
      status: 'conflict',
      serverVersion: resolution.currentVersion ?? state.serverVersion,
      pending,
      inFlight: null,
      recoveryRequired: true,
    }
  }
  return {
    ...state,
    status: resolution.code === 'offline' ? 'offline' : 'error',
    pending,
    inFlight: null,
    recoveryRequired: true,
  }
}
