import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Btn, Spinner, fmtDate } from "../components/ui";

const CHOICES = [
  ["yes", "Yes, I'll be there"],
  ["maybe", "Not sure yet"],
  ["no", "Sorry, I can't make it"],
] as const;

export default function Rsvp() {
  const { token } = useParams();
  const info = useQuery({ queryKey: ["rsvp", token], queryFn: () => api(`/rsvp/${token}`), retry: 3, retryDelay: 4000 });
  const [form, setForm] = useState({ name: "", phone: "", rsvp_status: "yes", party_size: 1, dietary: "" });
  const submit = useMutation({ mutationFn: () => api(`/rsvp/${token}`, { body: form }) });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (info.isLoading) {
    return (
      <div className="p-6">
        <Spinner label="Loading your invitation. The server may need a minute to wake up." />
      </div>
    );
  }
  if (info.isError) {
    return (
      <div className="p-6">
        <p role="alert" className="text-rani">
          This invitation link doesn't work. Please ask the host to send it again.
        </p>
      </div>
    );
  }
  const e = info.data;

  if (submit.isSuccess) {
    return (
      <div className="mx-auto max-w-md px-5 py-12">
        <h1 className="text-3xl font-bold">Thank you, {form.name.split(" ")[0]}.</h1>
        <p className="mt-3 text-lg">
          {form.rsvp_status === "yes"
            ? "Your reply is in. We look forward to seeing you."
            : form.rsvp_status === "maybe"
            ? "We've noted that you're not sure yet. You can reply again anytime from this link."
            : "We've noted that you can't make it. Thank you for letting us know."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <h1 className="text-3xl font-bold leading-tight">{e.title}</h1>
      <p className="mt-2 text-ink/75">
        {e.event_date ? fmtDate(e.event_date, true) : ""}
        {e.city ? (e.event_date ? ` in ${e.city}` : e.city) : ""}
      </p>
      <p className="mt-5 text-lg">Will you join us?</p>

      <form
        className="mt-4 space-y-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit.mutate();
        }}
      >
        <fieldset>
          <legend className="sr-only">Your answer</legend>
          <div className="space-y-2">
            {CHOICES.map(([value, label]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3.5 text-base ${
                  form.rsvp_status === value ? "border-teal bg-white" : "border-line bg-white/60"
                }`}
              >
                <input
                  type="radio"
                  name="rsvp"
                  value={value}
                  checked={form.rsvp_status === value}
                  onChange={() => set("rsvp_status", value)}
                  className="h-5 w-5"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Your name
          </label>
          <input id="name" required autoComplete="name" value={form.name} onChange={(x) => set("name", x.target.value)} className="py-3 text-base" />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1 block text-sm font-medium">
            Mobile number (optional)
          </label>
          <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(x) => set("phone", x.target.value)} className="py-3 text-base" />
        </div>
        {form.rsvp_status === "yes" && (
          <>
            <div>
              <label htmlFor="party" className="mb-1 block text-sm font-medium">
                How many people are coming, including you?
              </label>
              <input id="party" type="number" min={1} max={20} value={form.party_size} onChange={(x) => set("party_size", Number(x.target.value) || 1)} className="py-3 text-base" />
            </div>
            <div>
              <label htmlFor="diet" className="mb-1 block text-sm font-medium">
                Food preferences or allergies (optional)
              </label>
              <input id="diet" value={form.dietary} onChange={(x) => set("dietary", x.target.value)} className="py-3 text-base" />
            </div>
          </>
        )}
        <Btn type="submit" className="w-full py-3.5 text-base" disabled={submit.isPending || !form.name.trim()}>
          {submit.isPending ? "Sending your reply" : "Send my reply"}
        </Btn>
        {submit.isError && (
          <p role="alert" className="text-sm text-rani">
            Your reply didn't go through: {(submit.error as Error).message}. Please try again.
          </p>
        )}
      </form>
    </div>
  );
}
