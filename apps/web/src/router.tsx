import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { RequireAuth, RequireRole } from '@/auth/guards';
import { LoginPage } from '@/pages/login-page';
import { HomePage } from '@/pages/home-page';
import { PlaceholderPage } from '@/pages/placeholder-page';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            path: 'interviews',
            element: (
              <PlaceholderPage
                title="Interviews"
                description="Talk through a process with the AI interviewer."
                phase="Phase 2"
              />
            ),
          },
          {
            path: 'library',
            element: (
              <PlaceholderPage
                title="Process Library"
                description="Browse processes by department."
                phase="Phase 1"
              />
            ),
          },
          {
            path: 'knowledge',
            element: (
              <PlaceholderPage
                title="Knowledge"
                description="SOPs, policies and approval matrices the AI uses as reference."
                phase="Phase 3"
              />
            ),
          },
          {
            element: <RequireRole role="admin" />,
            children: [
              {
                path: 'admin',
                element: (
                  <PlaceholderPage
                    title="Admin"
                    description="Departments, knowledge bases, users and process governance."
                    phase="Phases 1–6"
                  />
                ),
              },
            ],
          },
        ],
      },
    ],
  },
]);
