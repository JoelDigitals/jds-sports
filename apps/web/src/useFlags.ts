import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import type { FlagsMap } from './types.ts';

function currentDflagParam(): string {
  const hash = window.location.hash;
  const qIndex = hash.indexOf('?');
  const search = qIndex >= 0 ? hash.slice(qIndex) : window.location.search;
  const m = search.match(/(?:^|[?&])dflag=([^&]*)/);
  return m ? `?dflag=${m[1]}` : '';
}

export function useFlags() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['flags', 'active'],
    queryFn: () => api.get<{ flags: FlagsMap }>(`/api/flags/active${currentDflagParam()}`),
    staleTime: 60_000,
  });

  return {
    flags: query.data?.flags ?? {},
    isLoading: query.isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['flags', 'active'] }),
    isActive: (name: string) => query.data?.flags?.[name] ?? false,
  };
}
