import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AdminSessionProvider } from './app/session';
import { queryClient } from './app/queryClient';
import { router } from './app/routes';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminSessionProvider>
        <RouterProvider router={router} />
      </AdminSessionProvider>
    </QueryClientProvider>
  );
}
