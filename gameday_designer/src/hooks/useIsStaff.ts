import { useEffect, useState } from 'react';
import { designerApi } from '../api/designerApi';

export function useIsStaff(): boolean {
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => {
    designerApi.getConfig().then(c => setIsStaff(c.is_staff)).catch(() => setIsStaff(false));
  }, []);
  return isStaff;
}
