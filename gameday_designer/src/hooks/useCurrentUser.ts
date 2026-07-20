import { useEffect, useState } from 'react';
import { designerApi } from '../api/designerApi';

export interface CurrentUser {
  username: string;
  avatarUrl: string | null;
}

const DEFAULT_CURRENT_USER: CurrentUser = { username: '', avatarUrl: null };

export function useCurrentUser(): CurrentUser {
  const [currentUser, setCurrentUser] = useState<CurrentUser>(DEFAULT_CURRENT_USER);

  useEffect(() => {
    designerApi.getConfig()
      .then(config => setCurrentUser({ username: config.username, avatarUrl: config.avatar_url }))
      .catch(() => setCurrentUser(DEFAULT_CURRENT_USER));
  }, []);

  return currentUser;
}
