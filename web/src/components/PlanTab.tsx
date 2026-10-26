import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Empty, fmtDate, titleCase } from "./ui";

export default function PlanTab({ ev, refresh }: { ev: any; refresh: () => void }) {
  const toggle = useMutation({
    mutationFn: (p: any) =>
      api(`/plan-items/${p.id}`, { method: "PATCH", body: { status: p.status === "done" ? "todo" : "done" } }),
    onSuccess: refresh,
  });
  const items: any[] = ev.plan_items;
  if (!items.length) {
    return <Empty title="No tasks yet">Ask the chat to add one. You'll approve it before it appears here.</Empty>;
  }
  const done = items.filter((p) => p.status === "done").length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section aria-labelledby="timeline-h">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="timeline-h" className="text-xl font-bold">
          Timeline
        </h2>
        <p className="text-sm text-ink/70">
          {done} of {items.length} done
        </p>
      </div>
      <div
        className="mb-5 h-2 overflow-hidden rounded-full bg-mist"
        role="progressbar"
        aria-label="Tasks done"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={done}
      >
        <div className="h-full bg-marigold" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>

      <ul className="divide-y divide-line border-y border-line">
        {items.map((p) => {
          const isDone = p.status === "done";
          const overdue = !isDone && p.due_date < today;
          return (
            <li key={p.id} className="flex items-start gap-3 py-3">
              <input
                id={`task-${p.id}`}
                type="checkbox"
                checked={isDone}
                onChange={() => toggle.mutate(p)}
                className="mt-1 h-5 w-5"
              />
              <label htmlFor={`task-${p.id}`} className="flex-1 cursor-pointer">
                <span className={`block font-medium ${isDone ? "text-ink/50 line-through" : ""}`}>{p.title}</span>
                {p.notes && <span className="block text-sm text-ink/65">{p.notes}</span>}
              </label>
              <div className="text-right text-sm">
                <span className={overdue ? "font-semibold text-rani" : ""}>{fmtDate(p.due_date)}</span>
                <span className="block text-xs text-ink/60">{titleCase(p.category)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm text-ink/70">
        You can tick tasks off here. Dates and new tasks only change when you approve a draft.
      </p>
    </section>
  );
}
