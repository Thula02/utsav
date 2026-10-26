import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Btn } from "./ui";

const SUGGESTIONS = [
  "What should I finalise this week?",
  "Move the photographer booking 5 days earlier",
  "Add a task to book a mehendi artist",
];

type Msg = { role: "user" | "assistant"; content: string; draft?: boolean };

export default function ChatTab({ ev, refresh, goDrafts }: { ev: any; refresh: () => void; goDrafts: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Ask me anything about this plan, or ask for a change. I'll draft any change for you to approve. Nothing is edited until you do.",
    },
  ]);
  const [text, setText] = useState("");

  const send = useMutation({
    mutationFn: (message: string) =>
      api(`/events/${ev.id}/chat`, {
        body: { message, history: msgs.slice(-6).map((m) => ({ role: m.role, content: m.content })) },
      }),
    onSuccess: (r: any) => {
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, draft: !!r.draft_id }]);
      if (r.draft_id) refresh();
    },
    onError: (e: any) => setMsgs((m) => [...m, { role: "assistant", content: `That didn't work: ${e.message}` }]),
  });

  const submit = (message: string) => {
    if (!message.trim() || send.isPending) return;
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setText("");
    send.mutate(message);
  };

  return (
    <section aria-labelledby="chat-h">
      <h2 id="chat-h" className="mb-4 text-xl font-bold">
        Chat about this plan
      </h2>
      <div className="mb-4 space-y-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-relaxed ${
                m.role === "user" ? "bg-teal text-white" : "border border-line bg-white"
              }`}
            >
              {m.content}
              {m.draft && (
                <div className="mt-3">
                  <Btn variant="gate" onClick={goDrafts} className="px-3 py-1.5">
                    Review the drafted change
                  </Btn>
                </div>
              )}
            </div>
          </div>
        ))}
        {send.isPending && <p className="text-sm text-ink/60">Thinking</p>}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => submit(s)}
            className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-mist"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your message
        </label>
        <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask or request a change" />
        <Btn type="submit" disabled={send.isPending || !text.trim()}>
          Send
        </Btn>
      </form>
    </section>
  );
}
