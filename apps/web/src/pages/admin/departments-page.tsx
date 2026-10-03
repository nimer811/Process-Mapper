import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import type { Department } from '@process-ai/shared';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDepartments } from '@/features/processes/queries';
import { DepartmentDialog } from '@/features/departments/department-dialog';

export function DepartmentsAdminPage() {
  const departments = useDepartments();
  const [dialog, setDialog] = useState<{ open: boolean; department: Department | null }>({
    open: false,
    department: null,
  });

  return (
    <>
      <nav className="text-muted-foreground mb-2 text-sm">
        <Link to="/admin" className="hover:underline">
          Admin
        </Link>{' '}
        / Departments
      </nav>
      <PageHeader
        title="Departments"
        description="Departments organise the Process Library."
        actions={
          <Button onClick={() => setDialog({ open: true, department: null })}>
            <Plus />
            New department
          </Button>
        }
      />
      {departments.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card className="py-0">
          <CardContent className="px-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL name</TableHead>
                  <TableHead className="text-right">Processes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.data?.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-medium">{d.name}</div>
                      {d.description && (
                        <div className="text-muted-foreground max-w-md truncate text-xs">
                          {d.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.slug}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.processCount}</TableCell>
                    <TableCell>
                      {d.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ open: true, department: d })}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <DepartmentDialog
        open={dialog.open}
        department={dialog.department}
        onOpenChange={(open) => setDialog((s) => ({ ...s, open }))}
      />
    </>
  );
}
