import { createContext, useContext } from 'react';
import type { Repository, RepositoryView } from '../data/repository';
import type { OperationType, Payload } from '../domain/types';
export type AppState = { repository: Repository; view: RepositoryView; calendarView: RepositoryView; calendarId?: string; mutate: (type: OperationType, payload: Payload) => Promise<void>; toast: (message: string, undo?: () => Promise<void>) => void; setDirty: (dirty: boolean) => void };
export const AppContext = createContext<AppState | null>(null);
export function useApp(): AppState { const context = useContext(AppContext); if (!context) throw new Error('Missing application context'); return context; }
