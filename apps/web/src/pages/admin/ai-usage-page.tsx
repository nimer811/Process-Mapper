import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AiUsage, AdminSettings } from '@process-ai/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const fmt = (n: number) =>
  n >= 1e6
    ? `${Math.round(n / 1e5) / 10}M`
    : n >= 1e3
      ? `${Math.round(n / 100) / 10}k`
      : String(Math.round(n));
const money = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);

/** How much AI the organisation uses, where, and against the monthly budget. */
export function AiUsagePage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const usage = useQuery({
    queryKey: ['ai-usage', month],
    queryFn: () => api<AiUsage>(`/admin/ai-usage?month=${month}`),
  });
  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api<AdminSettings>('/admin/settings'),
  });
  const u = usage.data;
  const pct =
    u && u.budgetTokens ? Math.min(100, Math.round((u.usedTokens / u.budgetTokens) * 100)) : null;

  return (
    <>
      <PageHeader
        title="AI usage"
        description="Every AI call is logged with the process and person it was for. Costs use the prices set in configuration."
        actions={
          <Input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-44"
            aria-label="Month"
          />
        }
      />
      {!u ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Tokens used" value={fmt(u.usedTokens)} />
            <Stat
              label="Estimated cost"
              value={u.pricesConfigured ? money(u.totals.cost) : 'Set prices'}
            />
            <Stat
              label="Calls"
              value={`${u.totals.calls}${u.totals.failures ? ` (${u.totals.failures} failed)` : ''}`}
            />
            <Stat
              label="Average response"
              value={u.avgLatencyMs === null ? '—' : `${(u.avgLatencyMs / 1000).toFixed(1)} s`}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly budget</CardTitle>
              <CardDescription>
                {u.budgetTokens
                  ? `${fmt(u.usedTokens)} of ${fmt(u.budgetTokens)} tokens. A warning shows at 80%; AI features pause at 100% until next month or a higher budget (AI_MONTHLY_TOKEN_BUDGET).`
                  : 'No budget set (AI_MONTHLY_TOKEN_BUDGET = 0). Set one to cap monthly use.'}
              </CardDescription>
            </CardHeader>
            {pct !== null && (
              <CardContent>
                <Progress
                  value={pct}
                  className={cn(pct >= 80 && '[&>div]:bg-amber-500')}
                  aria-label="Budget used"
                />
                {pct >= 80 && (
                  <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                    {pct}% of the budget is used.
                  </p>
                )}
              </CardContent>
            )}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="By department" rows={u.byDepartment} />
            <Breakdown title="By kind of AI work" rows={u.byPurpose} />
          </div>
          <Breakdown title="Top people" rows={u.byUser} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last six months</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end gap-3">
              {u.trend.map((t) => {
                const max = Math.max(1, ...u.trend.map((x) => x.tokens));
                return (
                  <div key={t.month} className="flex flex-1 flex-col items-center gap-1 text-xs">
                    <div
                      className="bg-sky-500/80 w-full rounded-t"
                      style={{ height: `${Math.max(2, (t.tokens / max) * 120)}px` }}
                      title={`${fmt(t.tokens)} tokens`}
                    />
                    <span className="text-muted-foreground">{t.month}</span>
                    <span>{fmt(t.tokens)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          {settings.data && (
            <p className="text-muted-foreground text-xs">
              Sign-in:{' '}
              {settings.data.authMode === 'entra' ? 'Microsoft Entra ID' : 'development users'} ·
              Transcripts kept{' '}
              {settings.data.transcriptRetentionMonths
                ? `${settings.data.transcriptRetentionMonths} months after an interview ends`
                : 'indefinitely'}
              .
            </p>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: AiUsage['byDepartment'] }) {
  return (
    <Card className="py-0">
      <CardHeader className="pt-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-2 pb-4 text-sm">No use this month.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="whitespace-normal">{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.calls}
                    {r.failures > 0 && (
                      <span className="text-destructive"> · {r.failures} failed</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(r.inputTokens + r.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.cost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
