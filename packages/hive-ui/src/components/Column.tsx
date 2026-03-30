import type { Task, TaskStatus } from '../lib/types';
import { TaskCard } from './TaskCard';

interface ColumnProps {
  title: string;
  status: TaskStatus;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
}

const bgColors: Record<TaskStatus, string> = {
  pending: 'bg-slate-50',
  claimed: 'bg-blue-50',
  working: 'bg-amber-50',
  done: 'bg-green-50',
  failed: 'bg-red-50',
};

const headerColors: Record<TaskStatus, string> = {
  pending: 'text-slate-600',
  claimed: 'text-blue-600',
  working: 'text-amber-600',
  done: 'text-green-600',
  failed: 'text-red-600',
};

export function Column({ title, status, tasks, onSelectTask }: ColumnProps) {
  return (
    <div className={`flex min-w-[200px] flex-col rounded-xl ${bgColors[status]} p-3`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={`text-sm font-semibold capitalize ${headerColors[status]}`}>
          {title}
        </h2>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-500">
          {tasks.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onSelectTask(task)} />
        ))}
        {tasks.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400 italic">No tasks</p>
        )}
      </div>
    </div>
  );
}
