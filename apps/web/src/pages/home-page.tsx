import { MessageSquarePlus } from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { PageHeader } from '@/components/page-header';
import { StartInterviewDialog } from '@/features/interviews/start-interview-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function HomePage() {
  const { user } = useAuth();
  const firstName = user?.displayName.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Map how work really happens, and keep it in one place."
        actions={
          <StartInterviewDialog
            trigger={
              <Button>
                <MessageSquarePlus />
                Map a process
              </Button>
            }
          />
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My interviews</CardTitle>
            <CardDescription>In-progress interviews will appear here.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting my validation</CardTitle>
            <CardDescription>Processes you own that need review.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently updated</CardTitle>
            <CardDescription>Latest changes in the Process Library.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
