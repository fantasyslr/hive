import type { RegisteredAgent } from '../lib/types';

interface AgentBarProps {
  agents: RegisteredAgent[];
  selectedAgent: string | null;
  onSelectAgent: (id: string | null) => void;
}

export function AgentBar({ agents, selectedAgent, onSelectAgent }: AgentBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2">
      {/* All chip */}
      <button
        onClick={() => onSelectAgent(null)}
        className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition ${
          selectedAgent === null
            ? 'bg-blue-600 text-white'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        All
      </button>

      {agents.map((agent) => (
        <button
          key={agent.agentId}
          onClick={() =>
            onSelectAgent(selectedAgent === agent.agentId ? null : agent.agentId)
          }
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition ${
            selectedAgent === agent.agentId
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              agent.status === 'online' ? 'bg-green-500' : 'bg-slate-400'
            }`}
          />
          <span>{agent.name}</span>
          {agent.capabilities.slice(0, 2).map((cap) => (
            <span
              key={cap}
              className="rounded bg-slate-200/60 px-1.5 py-0.5 text-[10px] text-slate-500"
            >
              {cap}
            </span>
          ))}
        </button>
      ))}

      {agents.length === 0 && (
        <span className="text-xs text-slate-400 italic">No agents registered</span>
      )}
    </div>
  );
}
