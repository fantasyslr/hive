import type { Task, TaskStatus } from '../lib/types';
import { Column } from './Column';
import { TASK_STATUSES } from '../lib/types';

interface BoardProps {
  tasks: Task[];
  selectedAgent: string | null;
  onSelectTask: (task: Task) => void;
}

const columnTitles: Record<TaskStatus, string> = {
  pending: 'Pending',
  claimed: 'Claimed',
  working: 'Working',
  done: 'Done',
  failed: 'Failed',
};

export function Board({ tasks, selectedAgent, onSelectTask }: BoardProps) {
  const filtered = selectedAgent
    ? tasks.filter((t) => t.assignee === selectedAgent)
    : tasks;

  return (
    <div className="grid flex-1 grid-cols-5 gap-3 overflow-x-auto p-3">
      {TASK_STATUSES.map((status) => (
        <Column
          key={status}
          title={columnTitles[status]}
          status={status}
          tasks={filtered.filter((t) => t.status === status)}
          onSelectTask={onSelectTask}
        />
      ))}
    </div>
  );
}
