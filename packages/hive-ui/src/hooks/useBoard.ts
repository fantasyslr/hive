import { useState, useEffect, useCallback } from 'react';
import type { RegisteredAgent, Task } from '../lib/types';
import { fetchBoard } from '../lib/api';

interface BoardState {
  agents: RegisteredAgent[];
  tasks: Task[];
  loading: boolean;
  error: string | null;
}

export function useBoard() {
  const [state, setState] = useState<BoardState>({
    agents: [],
    tasks: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const snapshot = await fetchBoard();
      setState({
        agents: snapshot.agents,
        tasks: snapshot.tasks,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch board',
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setAgents = useCallback((agents: RegisteredAgent[]) => {
    setState((prev) => ({ ...prev, agents }));
  }, []);

  const setTasks = useCallback((tasks: Task[]) => {
    setState((prev) => ({ ...prev, tasks }));
  }, []);

  return {
    ...state,
    setAgents,
    setTasks,
    refresh,
  };
}
