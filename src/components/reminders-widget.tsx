import Link from "next/link";
import { CalendarClock, AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export interface Reminder {
  id: string;
  itemId: string;
  itemTitle: string;
  title: string;
  dueDate: string;
}

const DAY = 86_400_000;

export function RemindersWidget({ reminders }: { reminders: Reminder[] }) {
  if (reminders.length === 0) return null;
  const now = Date.now();

  return (
    <Card className="glass border-amber-500/20">
      <CardContent className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-amber-500" /> Upcoming maintenance
        </h2>
        <div className="space-y-1">
          {reminders.map((r) => {
            const t = new Date(r.dueDate).getTime();
            const overdue = t < now;
            const soon = !overdue && t - now < 30 * DAY;
            return (
              <Link
                key={r.id}
                href={`/items/${r.itemId}`}
                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.itemTitle}</p>
                </div>
                {overdue ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" /> overdue
                  </Badge>
                ) : soon ? (
                  <Badge variant="warning">soon</Badge>
                ) : null}
                <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
                  {formatDate(r.dueDate)}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1" />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
