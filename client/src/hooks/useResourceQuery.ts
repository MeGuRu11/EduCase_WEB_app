import axios from 'axios';
import { useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

type ResourceQueryOptions<T> = Omit<
  UseQueryOptions<T | null, Error, T | null, QueryKey>,
  'queryKey' | 'queryFn'
>;

export function useResourceQuery<T>(
  key: QueryKey,
  fetcher: () => Promise<T>,
  options?: ResourceQueryOptions<T>,
): UseQueryResult<T | null, Error> {
  return useQuery<T | null, Error, T | null, QueryKey>({
    queryKey: key,
    queryFn: async () => {
      try {
        return await fetcher();
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
    ...options,
  });
}
