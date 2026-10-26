import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../api";
import { Btn, Empty, inr } from "./ui";

const LABEL: Record<string, string> = {
  vendor_message: "Message to a vendor",
  payment_reminder: "Payment reminder to the client",
  guest_invite: "Guest invite",
  plan_change: "Change to the plan",
};

/** Approve a draft. For messages we open the WhatsApp tab right away (inside the click) so browsers don't block it. */
async function approveAndOpen(d: any, body: string) {
  const isChange = d.type === "plan_change";
  const w = isChange ? null : window.open("about:blank", "_blank");
  try {
    if (!isChange && body !== d.body) await api(`/drafts/${d.id}`, { method: "PATCH", body: { body } });
    const r = await api(`/drafts/${d.id}/approve`, { method: "POST" });
    if (w) {
      if (r.wa_link) w.location.href = r.wa_link;
      else w.close();
    }
  } catch (e) {
    if (w) w.close();
    throw e;
  }
}

async function reopen(id: number) {
  const w = window.open("about:blank", "_blank");
  try {
    const r = await api(`/drafts/${id}/link`);
    if (w) w.location.href = r.wa_link;
  } catch {
    if (w) w.close();
  }
}

function DraftCard({ d, refresh }: { d: any; refresh: () => void }) {
  const [body, setBody] = useState<string>(d.body);
  const isChange = d.type === "plan_change";
  const approve = useMutation({ mutationFn: () => approveAndOpen(d, body), onSuccess: refresh });
  const reject = useMutation({ mutationFn: () => api(`/drafts/${d.id}/reject`, { method: "POST" }), onSuccess: refresh });
  const noPhone = !isChange && !d.recipient_phone;

  return (
    <article className="rounded-lg border border-line border-l-4 border-l-rani bg-white p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">{LABEL[d.type] || d.type}</h3>
          {d.recipient && (
            <p className="text-sm text-ink/70">
              To {d.recipient}
              {d.recipient_phone ? ` (${d.recipient_phone})` : ""}
            </p>
          )}
        </div>
        <span className="rounded-full bg-rani/10 px-2.5 py-1 text-xs font-semibold text-rani">Awaiting your approval</span>
      </header>

      {noPhone && (
        <p className="mt-3 text-sm text-ink/75">No phone number saved yet. WhatsApp will ask you to pick a contact.</p>
      )}

      <label htmlFor={`draft-${d.id}`} className="sr-only">
        Draft text
      </label>
      <textarea
        id={`draft-${d.id}`}
        className="mt-3"
        rows={isChange ? 3 : 5}
        value={body}
        readOnly={isChange}
        onChange={(e) => setBody(e.target.value)}
      />

      {d.payload?.upi_link && (
        <div className="mt-3 flex items-center gap-4">
          <QRCodeSVG value={d.payload.upi_link} size={96} />
          <p className="text-sm text-ink/75">
            UPI QR for {inr(d.payload.amount)}. Any UPI app can scan it. The message above also carries the UPI ID in plain text.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn variant="gate" onClick={() => approve.mutate()} disabled={approve.isPending || reject.isPending}>
          {isChange ? "Approve and apply" : "Approve and open WhatsApp"}
        </Btn>
        <Btn variant="danger" onClick={() => reject.mutate()} disabled={approve.isPending || reject.isPending}>
          Reject
        </Btn>
      </div>
      {(approve.isError || reject.isError) && (
        <p className="mt-2 text-sm text-rani" role="alert">
          {((approve.error || reject.error) as Error).message}
        </p>
      )}
    </article>
  );
}

function InviteRow({ d, refresh }: { d: any; refresh: () => void }) {
  const approve = useMutation({ mutationFn: () => approveAndOpen(d, d.body), onSuccess: refresh });
  const reject = useMutation({ mutationFn: () => api(`/drafts/${d.id}/reject`, { method: "POST" }), onSuccess: refresh });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <span>
        <span className="font-medium">{d.recipient}</span>
        <span className="ml-2 text-sm text-ink/60">{d.recipient_phone || "no phone"}</span>
      </span>
      <span className="flex gap-2">
        <Btn variant="gate" className="px-3 py-1.5" onClick={() => approve.mutate()} disabled={approve.isPending}>
          Approve and open WhatsApp
        </Btn>
        <Btn variant="danger" className="px-3 py-1.5" onClick={() => reject.mutate()} disabled={reject.isPending}>
          Skip
        </Btn>
      </span>
    </li>
  );
}

export default function DraftsTab({ ev, refresh }: { ev: any; refresh: () => void }) {
  const pending: any[] = ev.drafts.filter((d: any) => d.status === "pending");
  const cards = pending.filter((d) => d.type !== "guest_invite");
  const invites = pending.filter((d) => d.type === "guest_invite");
  const history: any[] = ev.drafts.filter((d: any) => d.status !== "pending");

  return (
    <section aria-labelledby="drafts-h">
      <h2 id="drafts-h" className="text-xl font-bold">
        Drafts awaiting approval
      </h2>
      <p className="mb-5 mt-1 text-ink/75">
        Utsav writes the drafts. Nothing is sent, and no date changes, until you approve it here. You can edit message text first.
      </p>

      {pending.length === 0 && (
        <Empty title="Nothing is waiting for you">
          New vendor messages, payment reminders, guest invites and AI-proposed changes will show up here.
        </Empty>
      )}

      <div className="space-y-4">
        {cards.map((d) => (
          <DraftCard key={`${d.id}-${d.body}`} d={d} refresh={refresh} />
        ))}
      </div>

      {invites.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold">Guest invites ({invites.length})</h3>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {invites.map((d) => (
              <InviteRow key={d.id} d={d} refresh={refresh} />
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-teal">Handled drafts ({history.length})</summary>
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {history.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>
                  {LABEL[d.type] || d.type}
                  {d.recipient ? ` to ${d.recipient}` : ""}:{" "}
                  <strong className={d.status === "approved" ? "text-teal" : "text-ink/60"}>
                    {d.status === "approved" ? "approved" : "rejected"}
                  </strong>
                </span>
                {d.status === "approved" && d.type !== "plan_change" && (
                  <Btn variant="ghost" className="px-3 py-1.5" onClick={() => reopen(d.id)}>
                    Open WhatsApp again
                  </Btn>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
