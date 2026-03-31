import type { Task } from '../lib/types';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

const kindColors: Record<string, string> = {
  plan: 'bg-purple-100 text-purple-700',
  execute: 'bg-blue-100 text-blue-700',
  verify: 'bg-teal-100 text-teal-700',
  fix: 'bg-orange-100 text-orange-700',
  review: 'bg-indigo-100 text-indigo-700',
  explore: 'bg-cyan-100 text-cyan-700',
  custom: 'bg-slate-100 text-slate-600',
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const kindClass = kindColors[task.taskKind || 'custom'] || kindColors.custom;

  return (
    <button
      onClick={onClick}
      className={`w-full cursor-pointer rounded-lg border p-3 text-left shadow-sm transition hover:shadow-md ${
        task.status === 'working'
          ? 'border-amber-300 bg-amber-50/50 ring-1 ring-amber-200'
          : 'border-slate-200 bg-white'
      }`}
    >
      <p className="mb-1 text-sm font-medium text-slate-800 line-clamp-2">
        {task.title}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap">
        {task.taskKind && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${kindClass}`}>
            {task.taskKind}
          </span>
        )}
        {task.verificationRequired && (
          <span className="text-[10px] text-amber-600" title="Verification required">
            &#x1f6e1;
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        {task.status === 'working' && (
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        )}
        <p className={`text-xs ${task.status === 'working' ? 'text-amber-600 font-medium' : 'text-slate-400'}`}>
          {task.assignee || 'Unassigned'}
        </p>
      </div>
    </button>
  );
}
