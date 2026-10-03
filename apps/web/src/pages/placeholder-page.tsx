import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PlaceholderPage({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Coming in {phase}</CardTitle>
          <CardDescription>This area is part of the build plan and not built yet.</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
