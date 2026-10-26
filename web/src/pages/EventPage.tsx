import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Spinner, fmtDate, titleCase } from "../components/ui";
import PlanTab from "../components/PlanTab";
import ChatTab from "../components/ChatTab";
import DraftsTab from "../components/DraftsTab";
import VendorsTab from "../components/VendorsTab";
import BudgetTab from "../components/BudgetTab";
import GuestsTab from "../components/GuestsTab";

const TABS = [
  ["plan", "Plan"],
  ["chat", "Chat"],
  ["drafts", "Drafts"],
  ["vendors", "Vendors"],
  ["budget", "Budget"],
  ["guests", "Guests"],
] as const;

export default function EventPage() {
  const { id } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("plan");

  const { data: ev, isLoading, error } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api(`/events/${id}`),
    refetchInterval: 8000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["event", id] });

  if (isLoading) {
    return (
      <div className="p-8">
        <Spinner label="Loading event" />
      </div>
    );
  }
  if (error || !ev) {
    return (
      <div className="p-8">
        <p className="text-rani" role="alert">
          Could not load this event. {(error as Error)?.message}
        </p>
        <Link to="/" className="text-teal underline">
          Back to all events
        </Link>
      </div>
    );
  }

  const pending = ev.drafts.filter((d: any) => d.status === "pending").length;
  const meta = [
    titleCase(ev.event_type),
    ev.city ? `in ${ev.city}` : "",
    ev.event_date ? `on ${fmtDate(ev.event_date, true)}` : "",
    ev.guest_count ? `for ${ev.guest_count} guests` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="min-h-screen">
      <header className="bg-teal text-white">
        <div className="mx-auto max-w-4xl px-5 pt-5">
          <Link to="/" className="text-sm text-white/80 underline-offset-2 hover:underline">
            All events
          </Link>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">{ev.title}</h1>
          <p className="mt-1 text-white/80">{meta}</p>

          <div role="tablist" aria-label="Event sections" className="mt-6 flex gap-1 overflow-x-auto">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                id={`tab-${key}`}
                aria-selected={tab === key}
                aria-controls="panel"
                onClick={() => setTab(key)}
                className={`whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tab === key ? "bg-page text-ink" : "text-white/80 hover:bg-teal-dark hover:text-white"
                }`}
              >
                {label}
                {key === "drafts" && pending > 0 && (
                  <span className="ml-2 rounded-full bg-rani px-2 py-0.5 text-xs font-bold text-white">{pending}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mx-auto max-w-4xl px-5 py-8">
        {location.state?.fallback && (
          <p className="mb-6 rounded-md border border-marigold bg-white px-4 py-3 text-sm" role="status">
            The AI was unavailable, so this is a sample plan. You can still edit everything below.
          </p>
        )}
        {tab === "plan" && <PlanTab ev={ev} refresh={refresh} />}
        {tab === "chat" && <ChatTab ev={ev} refresh={refresh} goDrafts={() => setTab("drafts")} />}
        {tab === "drafts" && <DraftsTab ev={ev} refresh={refresh} />}
        {tab === "vendors" && <VendorsTab ev={ev} refresh={refresh} />}
        {tab === "budget" && <BudgetTab ev={ev} refresh={refresh} goDrafts={() => setTab("drafts")} />}
        {tab === "guests" && <GuestsTab ev={ev} refresh={refresh} />}
      </main>
    </div>
  );
}
