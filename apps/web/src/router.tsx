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
import { InboxPage } from '@/pages/inbox-page';
import { FlowPage } from '@/pages/flow-page';
import { ClassificationPage } from '@/pages/admin/classification-page';
import { AiUsagePage } from '@/pages/admin/ai-usage-page';
import { PeoplePage } from '@/pages/admin/people-page';
import { InterviewPage } from '@/pages/interview-page';
import { ChatPage } from '@/pages/chat-page';
import { KnowledgeBasePage, KnowledgePage } from '@/pages/knowledge-page';
import { ApprovalsPage } from '@/pages/admin/approvals-page';
import { BestPracticesPage } from '@/pages/admin/best-practices-page';

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
          { path: 'inbox', element: <InboxPage /> },
          { path: 'interviews', element: <InterviewsPage /> },
          { path: 'interviews/:interviewId', element: <InterviewPage /> },
          { path: 'library', element: <LibraryPage /> },
          { path: 'library/:departmentSlug', element: <DepartmentPage /> },
          { path: 'processes/:processId', element: <ProcessPage /> },
          { path: 'processes/:processId/flow', element: <FlowPage /> },
          { path: 'knowledge', element: <KnowledgePage /> },
          { path: 'knowledge/:knowledgeBaseId', element: <KnowledgeBasePage /> },
          {
            element: <RequireRole role="admin" />,
            children: [
              { path: 'admin', element: <AdminPage /> },
              { path: 'admin/departments', element: <DepartmentsAdminPage /> },
              { path: 'admin/interviews', element: <InterviewsPage all /> },
              { path: 'admin/approvals', element: <ApprovalsPage /> },
              { path: 'admin/best-practices', element: <BestPracticesPage /> },
              { path: 'admin/classification', element: <ClassificationPage /> },
              { path: 'admin/ai-usage', element: <AiUsagePage /> },
              { path: 'admin/people', element: <PeoplePage /> },
              { path: 'admin/knowledge', element: <KnowledgePage admin /> },
              { path: 'admin/knowledge/:knowledgeBaseId', element: <KnowledgeBasePage admin /> },
            ],
          },
        ],
      },
    ],
  },
]);
