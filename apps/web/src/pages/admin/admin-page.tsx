import { Link } from 'react-router';
import {
  BookOpen,
  Building2,
  ClipboardCheck,
  Gauge,
  Lightbulb,
  Network,
  MessagesSquare,
  ScrollText,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const sections: {
  title: string;
  description: string;
  icon: LucideIcon;
  to?: string;
  phase?: string;
}[] = [
  {
    title: 'Departments',
    description: 'Create and organise departments.',
    icon: Building2,
    to: '/admin/departments',
  },
  {
    title: 'Knowledge bases',
    description: 'Upload SOPs, policies and approval matrices.',
    icon: BookOpen,
    to: '/admin/knowledge',
  },
  {
    title: 'Interview sessions',
    description: 'Review AI interview transcripts.',
    icon: MessagesSquare,
    to: '/admin/interviews',
  },
  {
    title: 'Approvals',
    description: 'Approve validated processes; assign owners.',
    icon: ClipboardCheck,
    to: '/admin/approvals',
  },
  {
    title: 'Best practices',
    description: 'Practices the AI applies in To-Be designs and checks.',
    icon: Lightbulb,
    to: '/admin/best-practices',
  },
  {
    title: 'Process classification',
    description: 'APQC-based process levels and which department covers each.',
    icon: Network,
    to: '/admin/classification',
  },
  {
    title: 'People and data',
    description: "Export or erase a person's data; transcript retention.",
    icon: Users,
    to: '/admin/people',
  },
  {
    title: 'AI usage',
    description: 'Tokens, cost and budget by department and kind of work.',
    icon: Gauge,
    to: '/admin/ai-usage',
  },
  {
    title: 'Audit log',
    description: 'Who changed what, and when.',
    icon: ScrollText,
    phase: 'Phase 6',
  },
];

export function AdminPage() {
  return (
    <>
      <PageHeader
        title="Admin"
        description="Manage departments, knowledge and process governance."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const card = (
            <Card
              className={
                s.to ? 'hover:border-foreground/30 h-full transition-colors' : 'h-full opacity-60'
              }
            >
              <CardHeader>
                <s.icon className="text-muted-foreground mb-2 size-5" />
                <CardTitle className="text-base">{s.title}</CardTitle>
                <CardDescription>
                  {s.phase ? `${s.description} Coming in ${s.phase}.` : s.description}
                </CardDescription>
              </CardHeader>
            </Card>
          );
          return s.to ? (
            <Link key={s.title} to={s.to}>
              {card}
            </Link>
          ) : (
            <div key={s.title}>{card}</div>
          );
        })}
      </div>
    </>
  );
}
