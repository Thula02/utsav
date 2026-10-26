import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Btn, Spinner, fmtDate, titleCase } from "../components/ui";

const TEMPLATES = [
  { key: "wedding", label: "Wedding or sangeet", brief: "Sangeet for 150 guests in Jaipur, ₹8L budget, 3 weeks away." },
  { key: "birthday", label: "Birthday", brief: "50th birthday dinner for 60 guests in Bengaluru, ₹3L budget, next month." },
  { key: "corporate", label: "Corporate", brief: "Annual partner meet for 200 people in Mumbai, ₹15L budget, in 6 weeks." },
];

export default function Home() {
  const nav = useNavigate();
  const [template, setTemplate] = useState(TEMPLATES[0].key);
  const [brief, setBrief] = useState(TEMPLATES[0].brief);

  const health = useQuery({ queryKey: ["health"], queryFn: () => api("/health"), retry: 4, retryDelay: 5000 });
  const events = useQuery({ queryKey: ["events"], queryFn: () => api("/events") });
  const generate = useMutation({
    mutationFn: () => api("/events/generate", { body: { brief, template } }),
    onSuccess: (r: any) => nav(`/event/${r.event_id}`, { state: { fallback: r.fallback } }),
  });

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16">
      <header className="flex items-center justify-between py-6">
        <span className="font-display text-2xl font-bold text-teal">Utsav</span>
        <span className="text-xs text-ink/60" role="status">
          {health.isSuccess ? "Server connected" : health.isError ? "Server not reachable" : "Waking the server, this can take a minute"}
        </span>
      </header>

      <section className="pt-6 pb-8">
        <h1 className="max-w-xl text-4xl font-bold leading-tight md:text-5xl">Plan an event from a two-line brief.</h1>
        <p className="mt-4 max-w-xl text-lg text-ink/75">
          Utsav writes the plan, the vendor messages and the budget. Nothing is sent and no date changes until you approve it.
        </p>
      </section>

      <section aria-labelledby="brief-label">
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Start from a template">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={template === t.key}
              onClick={() => {
                setTemplate(t.key);
                setBrief(t.brief);
              }}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                template === t.key ? "border-teal bg-teal text-white" : "border-line bg-white hover:bg-mist"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label id="brief-label" htmlFor="brief" className="mb-1 block text-sm font-medium">
          Describe the event
        </label>
        <textarea id="brief" rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} />
        <div className="mt-4 flex items-center gap-4">
          <Btn onClick={() => generate.mutate()} disabled={generate.isPending || brief.trim().length < 10}>
            Generate plan
          </Btn>
          {generate.isPending && <Spinner label="Planning your event. This usually takes 10 to 20 seconds." />}
        </div>
        {generate.isError && (
          <p className="mt-3 text-sm text-rani" role="alert">
            {(generate.error as Error).message}
          </p>
        )}
      </section>

      <section className="mt-14" aria-labelledby="events-heading">
        <h2 id="events-heading" className="mb-3 text-xl font-bold">
          Your events
        </h2>
        {events.isLoading && <Spinner label="Loading events" />}
        {events.data && events.data.length === 0 && (
          <p className="text-ink/70">No events yet. Generate your first plan above.</p>
        )}
        <ul className="divide-y divide-line border-y border-line">
          {events.data?.map((e: any) => (
            <li key={e.id}>
              <Link to={`/event/${e.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-mist/60">
                <span>
                  <span className="block font-semibold">{e.title}</span>
                  <span className="text-sm text-ink/70">
                    {titleCase(e.event_type)}
                    {e.city ? ` in ${e.city}` : ""}
                    {e.event_date ? `, ${fmtDate(e.event_date, true)}` : ""}
                  </span>
                </span>
                {e.pending_drafts > 0 && (
                  <span className="rounded-full bg-rani px-2.5 py-1 text-xs font-bold text-white">
                    {e.pending_drafts} awaiting approval
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
