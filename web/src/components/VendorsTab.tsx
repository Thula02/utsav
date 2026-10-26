import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Btn, Empty, Field, inr, num, titleCase } from "./ui";

const STATUSES: [string, string][] = [
  ["not_contacted", "Not contacted"],
  ["contacted", "Contacted"],
  ["quoted", "Quoted"],
  ["negotiating", "Negotiating"],
  ["confirmed", "Confirmed"],
  ["declined", "Declined"],
];

const toForm = (v: any) => ({
  name: v.name ?? "",
  phone: v.phone ?? "",
  upi_id: v.upi_id ?? "",
  status: v.status,
  quoted_amount: v.quoted_amount ?? "",
  agreed_amount: v.agreed_amount ?? "",
  paid_amount: v.paid_amount ?? "",
  advance_percent: v.advance_percent ?? "",
});

function VendorCard({ v, refresh }: { v: any; refresh: () => void }) {
  const [f, setF] = useState(toForm(v));
  const [reply, setReply] = useState("");
  useEffect(() => {
    setF(toForm(v));
  }, [v]);
  const set = (k: string, val: any) => setF((p) => ({ ...p, [k]: val }));

  const save = useMutation({
    mutationFn: (body: any) => api(`/vendors/${v.id}`, { method: "PATCH", body }),
    onSuccess: refresh,
  });
  const summarise = useMutation({
    mutationFn: () => api(`/vendors/${v.id}/reply`, { body: { text: reply } }),
    onSuccess: () => {
      setReply("");
      refresh();
    },
  });
  const summary = useMemo(() => {
    try {
      return v.last_summary ? JSON.parse(v.last_summary) : null;
    } catch {
      return null;
    }
  }, [v.last_summary]);

  const saveAll = () =>
    save.mutate({
      name: f.name,
      phone: f.phone,
      upi_id: f.upi_id,
      status: f.status,
      quoted_amount: num(f.quoted_amount),
      agreed_amount: num(f.agreed_amount),
      paid_amount: num(f.paid_amount) ?? 0,
      advance_percent: num(f.advance_percent),
    });

  return (
    <article className="py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">{titleCase(v.category)}</h3>
        <div className="w-48">
          <label htmlFor={`status-${v.id}`} className="sr-only">
            Status for {v.category}
          </label>
          <select id={`status-${v.id}`} value={f.status} onChange={(e) => set("status", e.target.value)}>
            {STATUSES.map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Vendor name">
          <input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="WhatsApp number">
          <input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="UPI ID (for advances)">
          <input value={f.upi_id} onChange={(e) => set("upi_id", e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Quoted (₹)">
          <input type="number" min={0} value={f.quoted_amount} onChange={(e) => set("quoted_amount", e.target.value)} />
        </Field>
        <Field label="Agreed (₹)">
          <input type="number" min={0} value={f.agreed_amount} onChange={(e) => set("agreed_amount", e.target.value)} />
        </Field>
        <Field label="Advance (%)">
          <input type="number" min={0} max={100} value={f.advance_percent} onChange={(e) => set("advance_percent", e.target.value)} />
        </Field>
        <Field label="Paid so far (₹)">
          <input type="number" min={0} value={f.paid_amount} onChange={(e) => set("paid_amount", e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Btn onClick={saveAll} disabled={save.isPending}>
          Save {v.category}
        </Btn>
        {save.isError && (
          <span className="text-sm text-rani" role="alert">
            {(save.error as Error).message}
          </span>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor={`reply-${v.id}`} className="mb-1 block text-sm font-medium">
          Paste the vendor's WhatsApp reply
        </label>
        <textarea id={`reply-${v.id}`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
        <div className="mt-2 flex items-center gap-3">
          <Btn variant="ghost" onClick={() => summarise.mutate()} disabled={!reply.trim() || summarise.isPending}>
            {summarise.isPending ? "Summarising" : "Summarise reply"}
          </Btn>
          {summarise.isError && (
            <span className="text-sm text-rani" role="alert">
              {(summarise.error as Error).message}
            </span>
          )}
        </div>
      </div>

      {summary && (
        <div className="mt-4 rounded-lg border border-line border-l-4 border-l-marigold bg-white p-4">
          <p className="font-medium">{summary.summary}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
            <div>
              <dt className="text-ink/60">Quote</dt>
              <dd>{summary.quoted_amount != null ? inr(summary.quoted_amount) : "Not stated"}</dd>
            </div>
            <div>
              <dt className="text-ink/60">Advance</dt>
              <dd>{summary.advance_percent != null ? `${summary.advance_percent}%` : "Not stated"}</dd>
            </div>
            <div>
              <dt className="text-ink/60">Available on the date</dt>
              <dd>{summary.available === true ? "Yes" : summary.available === false ? "No" : "Not stated"}</dd>
            </div>
          </dl>
          {summary.next_action && <p className="mt-2 text-sm text-ink/75">Suggested next step: {summary.next_action}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.quoted_amount != null && (
              <Btn variant="ghost" className="px-3 py-1.5" onClick={() => save.mutate({ quoted_amount: summary.quoted_amount })}>
                Use as quoted amount
              </Btn>
            )}
            {summary.quoted_amount != null && (
              <Btn variant="ghost" className="px-3 py-1.5" onClick={() => save.mutate({ agreed_amount: summary.quoted_amount })}>
                Use as agreed amount
              </Btn>
            )}
            {summary.advance_percent != null && (
              <Btn variant="ghost" className="px-3 py-1.5" onClick={() => save.mutate({ advance_percent: summary.advance_percent })}>
                Use this advance
              </Btn>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default function VendorsTab({ ev, refresh }: { ev: any; refresh: () => void }) {
  if (!ev.vendors.length) return <Empty title="No vendors yet">Vendor slots appear when a plan is generated.</Empty>;
  return (
    <section aria-labelledby="vendors-h">
      <h2 id="vendors-h" className="text-xl font-bold">
        Vendors
      </h2>
      <p className="mt-1 text-ink/75">
        You set every status yourself. The AI only reads replies and suggests numbers. A vendor counts toward your budget once it's
        Confirmed and has an agreed amount.
      </p>
      <div className="mt-2 divide-y divide-line border-b border-line">
        {ev.vendors.map((v: any) => (
          <VendorCard key={v.id} v={v} refresh={refresh} />
        ))}
      </div>
    </section>
  );
}
