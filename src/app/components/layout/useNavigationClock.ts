import { useEffect, useState } from 'react';

import { getCentralClockParts } from '@/features/system-status/lib/systemStatusClock';

export function useNavigationClock() {
  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const handle = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(handle);
  }, []);

  return getCentralClockParts(clockNow);
}
