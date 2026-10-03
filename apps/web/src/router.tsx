import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { RequireAuth, RequireRole } from '@/auth/guards';
import { LoginPage } from '@/pages/login-page';
import { HomePage } from '@/pages/home-page';
import { LibraryPage } from '@/pages/library-page';
import { DepartmentPage } from '@/pages/department-page';
import { ProcessPage } from '@/pages/process-page';
import { AdminPage } from '@/pages/admin/admin-page';
import { DepartmentsAdminPage } from '@/pages/admin/departments-page';
import { InterviewsPage } from '@/pages/interviews-page';
import { InterviewPage } from '@/pages/interview-page';
import { ChatPage } from '@/pages/chat-page';
import { KnowledgeBasePage, KnowledgePage } from '@/pages/knowledge-page';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      // Proof-of-concept chat channel: full screen, outside the app layout.
      { path: 'chat', element: <ChatPage /> },
      { path: 'chat/:interviewId', element: <ChatPage /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'interviews', element: <InterviewsPage /> },
          { path: 'interviews/:interviewId', element: <InterviewPage /> },
          { path: 'library', element: <LibraryPage /> },
          { path: 'library/:departmentSlug', element: <DepartmentPage /> },
          { path: 'processes/:processId', element: <ProcessPage /> },
          { path: 'knowledge', element: <KnowledgePage /> },
          { path: 'knowledge/:knowledgeBaseId', element: <KnowledgeBasePage /> },
          {
            element: <RequireRole role="admin" />,
            children: [
              { path: 'admin', element: <AdminPage /> },
              { path: 'admin/departments', element: <DepartmentsAdminPage /> },
              { path: 'admin/interviews', element: <InterviewsPage all /> },
              { path: 'admin/knowledge', element: <KnowledgePage admin /> },
              { path: 'admin/knowledge/:knowledgeBaseId', element: <KnowledgeBasePage admin /> },
            ],
          },
        ],
      },
    ],
  },
]);
