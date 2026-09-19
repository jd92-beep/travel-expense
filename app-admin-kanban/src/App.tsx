import { RouterProvider } from 'react-router';
import { AdminSessionProvider } from './app/session';
import { router } from './app/routes';

// No QueryClientProvider here — it lives inside the lazy ProtectedShell chunk so
// @tanstack/react-query never lands in the entry (login) bundle.
export function App() {
  return (
    <AdminSessionProvider>
      <RouterProvider router={router} />
    </AdminSessionProvider>
  );
}
