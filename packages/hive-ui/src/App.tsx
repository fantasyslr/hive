import { useState, useCallback } from 'react';
import type { Task } from './lib/types';
import { useBoard } from './hooks/useBoard';
import { useSSE } from './hooks/useSSE';
import { AgentBar } from './components/AgentBar';
import { Board } from './components/Board';
import { TaskDetail } from './components/TaskDetail';
import { CreateTaskForm } from './components/CreateTaskForm';
import { StatusDot } from './components/StatusDot';

export function App() {
  const { agents, tasks, loading, error, refresh } = useBoard();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const handleEvent = useCallback(() => {
    // SSE event received — re-fetch the full board (simplest MVP strategy)
    refresh();
  }, [refresh]);

  const { connected } = useSSE({ onEvent: handleEvent });

  const handleTaskCreated = useCallback(
    (_task: Task) => {
      refresh();
    },
    [refresh],
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-slate-400">Loading board...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-red-500">Failed to load board: {error}</p>
        <button
          onClick={refresh}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800">Hive</h1>
        <StatusDot connected={connected} />
        <div className="flex-1">
          <AgentBar
            agents={agents}
            tasks={tasks}
            selectedAgent={selectedAgent}
            onSelectAgent={setSelectedAgent}
          />
        </div>
        <CreateTaskForm onCreated={handleTaskCreated} />
      </header>

      {/* Board */}
      <main className="flex-1 overflow-hidden">
        <Board
          tasks={tasks}
          selectedAgent={selectedAgent}
          onSelectTask={setSelectedTask}
        />
      </main>

      {/* Detail panel */}
      <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} />
    </div>
  );
}
