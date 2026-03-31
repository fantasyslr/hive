import { useState } from 'react';
import type { Task, TaskKind } from '../lib/types';
import { TASK_KINDS } from '../lib/types';
import { createTask } from '../lib/api';

interface CreateTaskFormProps {
  onCreated: (task: Task) => void;
}

export function CreateTaskForm({ onCreated }: CreateTaskFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [taskKind, setTaskKind] = useState<TaskKind>('execute');
  const [verificationRequired, setVerificationRequired] = useState(false);

  const reset = () => {
    setTitle('');
    setDescription('');
    setCapabilities('');
    setTaskKind('execute');
    setVerificationRequired(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const caps = capabilities
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const task = await createTask({
        title: title.trim(),
        description: description.trim(),
        requiredCapabilities: caps.length > 0 ? caps : ['general'],
        createdBy: 'web-ui',
        taskKind,
        verificationRequired,
      });
      onCreated(task);
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
      >
        + New Task
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Create Task</h3>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          className="text-slate-400 hover:text-slate-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            placeholder="Task title"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            rows={3}
            placeholder="What needs to be done..."
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Required Capabilities (comma-separated)
          </label>
          <input
            type="text"
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            placeholder="coding, review, analysis"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Task Kind</label>
            <select
              value={taskKind}
              onChange={(e) => setTaskKind(e.target.value as TaskKind)}
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
            >
              {TASK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={verificationRequired}
                onChange={(e) => setVerificationRequired(e.target.checked)}
                className="rounded border-slate-300"
              />
              Verify
            </label>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { reset(); setOpen(false); }}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </form>
  );
}
