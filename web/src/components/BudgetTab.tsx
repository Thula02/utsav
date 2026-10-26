import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Btn, Field, inr, titleCase } from "./ui";

/** Editable "planned" amount for one category. Saves when you click away from the box. */
function PlannedInput({ item, refresh }: { item: any; refresh: () => void }) {
  const current = String(Math.round(Number(item.planned) || 0));
  const [v, setV] = useState(current);
  useEffect(() => {
    setV(current);
  }, [current]);
  const save = useMutation({
    mutationFn: () => api(`/budget-items/${item.id}`, { method: "PATCH", body: { planned_amount: Number(v) || 0 } }),
    onSuccess: refresh,
  });
  return (
    <span className="inline-flex items-center gap-1">
      <label htmlFor={`planned-${item.id}`} className="sr-only">
        Planned amount for {item.category}
      </label>
      <span aria-hidden="true">₹</span>
      <input
        id={`planned-${item.id}`}
        type="number"
        min={0}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v !== current && v !== "") save.mutate();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="w-28 py-1 text-right text-sm"
      />
    </span>
  );
}

export default function BudgetTab({ ev, refresh, goDrafts }: { ev: any; refresh: () => void; goDrafts: () => void }) {
  const t = ev.totals;
  const [total, setTotal] = useState(String(Math.round(t.budget_total || 0)));
  useEffect(() => {
    setTotal(String(Math.round(t.budget_total || 0)));
  }, [t.budget_total]);
  const [client, setClient] = useState({ client_name: ev.client_name || "", client_phone: ev.client_phone || "" });

  const saveTotal = useMutation({
    mutationFn: () => api(`/events/${ev.id}/budget`, { method: "PATCH", body: { budget_total: Number(total) || 0 } }),
    onSuccess: refresh,
  });
  const saveClient = useMutation({
    mutationFn: () => api(`/events/${ev.id}`, { method: "PATCH", body: client }),
    onSuccess: refresh,
  });
  const remind = useMutation({
    mutationFn: () => api(`/events/${ev.id}/payment-reminders`, { method: "POST" }),
    onSuccess: refresh,
  });
  const left = t.budget_total - t.committed;
  const overAllocated = t.planned > t.budget_total + 1;

  return (
    <section aria-labelledby="budget-h">
      <h2 id="budget-h" className="mb-4 text-xl font-bold">
        Budget
      </h2>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Total budget (₹)">
            <input
              type="number"
              min={0}
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTotal.mutate();
              }}
            />
          </Field>
        </div>
        <Btn onClick={() => saveTotal.mutate()} disabled={saveTotal.isPending || total === "" || Number(total) === Math.round(t.budget_total || 0)}>
          {saveTotal.isPending ? "Saving" : "Update budget"}
        </Btn>
        {saveTotal.isError && (
          <span className="text-sm text-rani" role="alert">
            {(saveTotal.error as Error).message}
          </span>
        )}
      </div>
      <p className="-mt-2 mb-5 max-w-2xl text-sm text-ink/70">
        Changing the total rescales every category in the same proportions. You can then fine-tune any category below.
      </p>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {[
          ["Total budget", inr(t.budget_total)],
          ["Committed", inr(t.committed)],
          ["Paid", inr(t.paid)],
          [left >= 0 ? "Left to commit" : "Over budget by", inr(Math.abs(left))],
        ].map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <dt className="text-sm text-ink/65">{label}</dt>
            <dd className="mt-1 font-display text-xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {ev.budget.map((b: any) => {
          const planned = Number(b.planned) || 0;
          const committed = Number(b.committed) || 0;
          const paid = Number(b.paid) || 0;
          const pctC = planned > 0 ? Math.min(100, (committed / planned) * 100) : committed > 0 ? 100 : 0;
          const pctP = planned > 0 ? Math.min(100, (paid / planned) * 100) : 0;
          const over = planned > 0 && committed > planned;
          return (
            <li key={b.id} className="py-3">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{titleCase(b.category)}</span>
                <span className={`flex items-center gap-2 ${over ? "font-semibold text-rani" : "text-ink/75"}`}>
                  {inr(committed)} committed of
                  <PlannedInput item={b} refresh={refresh} />
                  {over ? " (over)" : ""}
                </span>
              </div>
              <div
                className="relative h-3 overflow-hidden rounded-full bg-mist"
                role="img"
                aria-label={`${titleCase(b.category)}: ${inr(committed)} committed and ${inr(paid)} paid out of ${inr(planned)} planned`}
              >
                <div className={`absolute inset-y-0 left-0 ${over ? "bg-rani" : "bg-marigold"}`} style={{ width: `${pctC}%` }} />
                <div className="absolute inset-y-0 left-0 bg-teal" style={{ width: `${pctP}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-ink/70">
        Yellow is committed to confirmed vendors. Green is already paid. Allocated across categories: {inr(t.planned)} of {inr(t.budget_total)}
        {overAllocated ? ". The categories add up to more than your total budget." : "."}
      </p>

      <div className="mt-10">
        <h3 className="text-lg font-bold">Payment reminders</h3>
        <p className="mt-1 max-w-2xl text-ink/75">
          Utsav drafts a message to your client for each confirmed vendor whose advance is still due. The message includes the vendor's
          UPI ID and a QR code. You approve it before anything is sent.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Client name">
            <input value={client.client_name} onChange={(e) => setClient({ ...client, client_name: e.target.value })} />
          </Field>
          <Field label="Client WhatsApp number">
            <input type="tel" inputMode="tel" value={client.client_phone} onChange={(e) => setClient({ ...client, client_phone: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Btn variant="ghost" onClick={() => saveClient.mutate()} disabled={saveClient.isPending}>
            Save client details
          </Btn>
          <Btn onClick={() => remind.mutate()} disabled={remind.isPending}>
            Draft payment reminders
          </Btn>
        </div>
        {remind.isSuccess && (
          <p className="mt-3 text-sm" role="status">
            {remind.data.created > 0 ? (
              <>
                {remind.data.created} reminder draft(s) created.{" "}
                <button className="font-semibold text-teal underline" onClick={goDrafts}>
                  Review them in Drafts
                </button>
              </>
            ) : (
              "No reminders needed. Confirm a vendor and set an agreed amount first, or the advance is already paid."
            )}
          </p>
        )}
        {remind.isError && (
          <p className="mt-3 text-sm text-rani" role="alert">
            {(remind.error as Error).message}
          </p>
        )}
      </div>
    </section>
  );
}
