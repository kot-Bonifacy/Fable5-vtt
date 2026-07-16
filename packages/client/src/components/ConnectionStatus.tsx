import { useConnectionStore } from '../stores/connectionStore.js';

export function ConnectionStatus() {
  const connected = useConnectionStore((s) => s.connected);
  return (
    <span className="connection-status" title={connected ? 'Połączono z serwerem' : 'Rozłączono'}>
      <span
        className={`status-dot ${connected ? 'status-dot--connected' : 'status-dot--disconnected'}`}
      />
      {connected ? 'Połączono' : 'Rozłączono'}
    </span>
  );
}
