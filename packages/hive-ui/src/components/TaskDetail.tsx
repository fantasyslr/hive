import type { Task } from '../lib/types';

interface TaskDetailProps {
  task: Task | null;
  onClose: () => void;
}

const statusBadge: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  claimed: 'bg-blue-100 text-blue-700',
  working: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export function TaskDetail({ task, onClose }: TaskDetailProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity ${
          task ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-96 flex-col bg-white shadow-xl transition-transform duration-200 ${
          task ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {task && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 p-4">
              <div className="flex-1 pr-4">
                <h2 className="text-lg font-semibold text-slate-800">{task.title}</h2>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      statusBadge[task.status] || statusBadge.pending
                    }`}
                  >
                    {task.status}
                  </span>
                  {task.task_kind && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {task.task_kind}
                    </span>
                  )}
                  {task.verification_required && (
                    <span className="text-xs text-amber-600" title="Verification required">
                      Needs verification
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-slate-400">Assignee</span>
                  <p className="text-slate-700">{task.assignee || 'Unassigned'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Created by</span>
                  <p className="text-slate-700">{task.createdBy}</p>
                </div>
                <div>
                  <span className="text-slate-400">Created</span>
                  <p className="text-slate-700">{new Date(task.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-slate-400">Updated</span>
                  <p className="text-slate-700">{new Date(task.updatedAt).toLocaleString()}</p>
                </div>
                {task.parent_task_id && (
                  <div className="col-span-2">
                    <span className="text-slate-400">Parent task</span>
                    <p className="text-slate-700 font-mono text-xs">{task.parent_task_id}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              {task.description && (
                <div>
                  <h3 className="mb-1 text-sm font-medium text-slate-500">Description</h3>
                  <p className="whitespace-pre-wrap text-sm text-slate-700 bg-slate-50 rounded-lg p-3">
                    {task.description}
                  </p>
                </div>
              )}

              {/* Result (done) */}
              {task.result && (
                <div>
                  <h3 className="mb-1 text-sm font-medium text-green-600">Result</h3>
                  <p className="whitespace-pre-wrap text-sm text-slate-700 bg-green-50 rounded-lg p-3">
                    {task.result}
                  </p>
                </div>
              )}

              {/* Error (failed) */}
              {task.error && (
                <div>
                  <h3 className="mb-1 text-sm font-medium text-red-600">Error</h3>
                  <p className="whitespace-pre-wrap text-sm text-red-700 bg-red-50 rounded-lg p-3">
                    {task.error}
                  </p>
                </div>
              )}

              {/* Output refs */}
              {task.output_refs && task.output_refs.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-medium text-slate-500">Output References</h3>
                  <ul className="space-y-1">
                    {task.output_refs.map((ref, i) => (
                      <li key={i} className="text-xs text-blue-600 font-mono bg-slate-50 rounded px-2 py-1">
                        {ref}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Capabilities */}
              {task.requiredCapabilities.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-medium text-slate-500">Required Capabilities</h3>
                  <div className="flex flex-wrap gap-1">
                    {task.requiredCapabilities.map((cap) => (
                      <span
                        key={cap}
                        className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
