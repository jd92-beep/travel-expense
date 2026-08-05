import { QueryClient } from "@tanstack/react-query";
import { AdminApiError } from "../lib/adminApi";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 10 * 60 * 1000,
      networkMode: "offlineFirst",
      refetchIntervalInBackground: false,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (
          error instanceof AdminApiError &&
          [400, 401, 403, 404, 409, 422].includes(error.status)
        ) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attempt, error) => {
        if (error instanceof AdminApiError && error.retryAfterSeconds) {
          return error.retryAfterSeconds * 1000;
        }
        return Math.min(1000 * 2 ** attempt, 8000);
      },
      staleTime: 60_000,
    },
    mutations: {
      networkMode: "online",
      retry: 0,
    },
  },
});
