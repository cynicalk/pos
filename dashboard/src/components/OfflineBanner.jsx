import { WifiOff } from 'lucide-react';
import { useOnline } from '../hooks/useOnline';

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 font-medium"
      style={{ background: 'var(--warn)', color: '#fff', fontSize: 12 }}
    >
      <WifiOff size={13} />
      Offline — changes will sync when connection is restored
    </div>
  );
}
