import type { ExecutionResultData } from '../../types';

export type SandboxOutputFormat = 'json' | 'markdown' | 'text';

interface PendingRun {
  id: number;
  revision: number;
  model: string;
  outputFormat: SandboxOutputFormat;
}

interface CompletedRun {
  id: number;
  result: ExecutionResultData;
  outputFormat: SandboxOutputFormat;
}

export interface SandboxRunState {
  revision: number;
  pendingRun: PendingRun | null;
  completedRun: CompletedRun | null;
  error: string | null;
  copied: boolean;
}

export const initialSandboxRunState: SandboxRunState = {
  revision: 0,
  pendingRun: null,
  completedRun: null,
  error: null,
  copied: false,
};

type SandboxRunAction =
  | { type: 'invalidate' }
  | { type: 'start'; id: number; model: string; outputFormat: SandboxOutputFormat }
  | { type: 'success'; id: number; result: ExecutionResultData }
  | { type: 'failure'; id: number; error: string }
  | { type: 'validation-error'; error: string }
  | { type: 'copy'; id: number; copied: boolean };

export function sandboxRunReducer(state: SandboxRunState, action: SandboxRunAction): SandboxRunState {
  switch (action.type) {
    case 'invalidate':
      // Keep a pending request blocked until it settles; UI edits cannot undo a provider call.
      return { ...state, revision: state.revision + 1, completedRun: null, error: null, copied: false };
    case 'start':
      if (state.pendingRun) return state;
      return {
        ...state,
        pendingRun: { id: action.id, revision: state.revision, model: action.model, outputFormat: action.outputFormat },
        completedRun: null,
        error: null,
        copied: false,
      };
    case 'success': {
      const pending = state.pendingRun;
      if (!pending || pending.id !== action.id) return state;
      return {
        ...state,
        pendingRun: null,
        completedRun: pending.revision === state.revision
          ? { id: pending.id, result: action.result, outputFormat: pending.outputFormat }
          : null,
      };
    }
    case 'failure': {
      const pending = state.pendingRun;
      if (!pending || pending.id !== action.id) return state;
      return {
        ...state,
        pendingRun: null,
        completedRun: null,
        error: pending.revision === state.revision ? action.error : null,
        copied: false,
      };
    }
    case 'validation-error':
      return { ...state, completedRun: null, error: action.error, copied: false };
    case 'copy':
      return state.completedRun?.id === action.id ? { ...state, copied: action.copied } : state;
  }
}

export function sandboxExportDetails(format: SandboxOutputFormat) {
  switch (format) {
    case 'json': return { extension: 'json', mimeType: 'application/json;charset=utf-8' };
    case 'markdown': return { extension: 'md', mimeType: 'text/markdown;charset=utf-8' };
    case 'text': return { extension: 'txt', mimeType: 'text/plain;charset=utf-8' };
  }
}
