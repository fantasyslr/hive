interface StatusDotProps {
  connected: boolean;
}

export function StatusDot({ connected }: StatusDotProps) {
  return (
    <div className="flex items-center gap-1.5" title={connected ? 'Connected' : 'Disconnected'}>
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      <span className="text-xs text-slate-500">
        {connected ? 'Live' : 'Offline'}
      </span>
    </div>
  );
}
