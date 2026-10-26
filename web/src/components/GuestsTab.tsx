import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Btn, Empty } from "./ui";

const RESPONSE: Record<string, string> = { yes: "Coming", no: "Not coming", maybe: "Maybe", pending: "No reply yet" };

export default function GuestsTab({ ev, refresh }: { ev: any; refresh: () => void }) {
  const guests: any[] = ev.guests;
  const link = `${window.location.origin}/rsvp/${ev.rsvp_token}`;
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");

  const add = useMutation({
    mutationFn: () => api(`/events/${ev.id}/guests`, { body: { text } }),
    onSuccess: () => {
      setText("");
      refresh();
    },
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this RSVP link", link);
    }
  };

  const count = (s: string) => guests.filter((g) => g.rsvp_status === s).length;
  const heads = guests.filter((g) => g.rsvp_status === "yes").reduce((n, g) => n + (g.party_size || 1), 0);

  return (
    <section aria-labelledby="guests-h">
      <h2 id="guests-h" className="text-xl font-bold">
        Guests and RSVPs
      </h2>

      <div className="mt-4">
        <label htmlFor="rsvp-link" className="mb-1 block text-sm font-medium">
          Public RSVP link (anyone with it can reply)
        </label>
        <div className="flex gap-2">
          <input id="rsvp-link" readOnly value={link} onFocus={(e) => e.target.select()} />
          <Btn variant="ghost" onClick={copy} className="shrink-0">
            {copied ? "Copied" : "Copy link"}
          </Btn>
        </div>
      </div>

      <p className="mt-6 text-lg">
        <strong>{heads}</strong> people confirmed from {count("yes")} replies. {count("maybe")} maybe, {count("no")} can't come,{" "}
        {count("pending")} haven't replied.
      </p>

      <div className="mt-6">
        <label htmlFor="guest-add" className="mb-1 block text-sm font-medium">
          Add guests, one per line (name, then phone number if you have it)
        </label>
        <textarea id="guest-add" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Aarav Sharma, 98765 43210\nMeera Iyer"} />
        <div className="mt-2 flex items-center gap-3">
          <Btn onClick={() => add.mutate()} disabled={!text.trim() || add.isPending}>
            Add guests and draft invites
          </Btn>
          {add.isSuccess && <span className="text-sm">{add.data.created} added. Invites are waiting in Drafts.</span>}
          {add.isError && (
            <span className="text-sm text-rani" role="alert">
              {(add.error as Error).message}
            </span>
          )}
        </div>
      </div>

      <div className="mt-8">
        {guests.length === 0 ? (
          <Empty title="No guests yet">Add names above, or share the RSVP link and guests can add themselves.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-y border-line text-left text-sm">
              <caption className="sr-only">Guest list</caption>
              <thead>
                <tr className="border-b border-line text-ink/65">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Phone</th>
                  <th className="py-2 pr-3 font-medium">Reply</th>
                  <th className="py-2 pr-3 font-medium">People</th>
                  <th className="py-2 font-medium">Food notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {guests.map((g) => (
                  <tr key={g.id}>
                    <td className="py-2 pr-3 font-medium">{g.name}</td>
                    <td className="py-2 pr-3">{g.phone || "-"}</td>
                    <td className={`py-2 pr-3 ${g.rsvp_status === "yes" ? "font-semibold text-teal" : ""}`}>{RESPONSE[g.rsvp_status]}</td>
                    <td className="py-2 pr-3">{g.rsvp_status === "yes" ? g.party_size : "-"}</td>
                    <td className="py-2">{g.dietary || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
