"use client";

import { useEffect, useRef, useState } from "react";
import { streamDiagnostic } from "@/lib/api";
import type { ChatMessage, DiagnosticSession } from "@/lib/types";
import { MarkdownResponse } from "./markdown-response";
import { SpecterMark, Spinner } from "./specter-mark";

const SUGGESTIONS = [
  { title: "Mi equipo está lento", question: "¿Qué podría explicar que mi computadora esté lenta?", hint: "Relaciona los síntomas con tus métricas" },
  { title: "Entender los procesos", question: "Explícame qué proceso consume más recursos.", hint: "Descubre qué utiliza CPU y memoria" },
  { title: "Temperatura y disco", question: "¿Qué puedes saber sobre la temperatura y el disco?", hint: "Comprende las lecturas y sus límites" },
];

function conversationWindow(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-21);
  while (recent.reduce((size, message) => size + message.content.length, 0) > 32000) recent.splice(0, 2);
  return recent;
}

type Props = {
  session: DiagnosticSession | null;
  isDiagnosing: boolean;
  diagnosticError: string | null;
  canDiagnose: boolean;
  onRun: () => void;
  onBusyChange: (busy: boolean) => void;
};

type Incomplete = { question: string; content: string };

export function DiagnosticChat({ session, isDiagnosing, diagnosticError, canDiagnose, onRun, onBusyChange }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [streamed, setStreamed] = useState("");
  const [incomplete, setIncomplete] = useState<Incomplete | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const abortReason = useRef<"stop" | "timeout" | null>(null);
  const followScroll = useRef(true);
  const transcript = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = pending !== null;

  useEffect(() => {
    return () => {
      controller.current?.abort();
      onBusyChange(false);
    };
  }, [onBusyChange]);

  useEffect(() => {
    if (followScroll.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, pending, streamed, error]);

  function latest() {
    followScroll.current = true;
    setAtBottom(true);
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "smooth" });
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || !session || isDiagnosing || controller.current) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    const abortController = new AbortController();
    controller.current = abortController;
    abortReason.current = null;
    followScroll.current = true;
    setAtBottom(true);
    setPending(content);
    setStreamed("");
    setIncomplete(null);
    setDraft("");
    setError(null);
    onBusyChange(true);
    let received = "";
    const timeout = setTimeout(() => { abortReason.current = "timeout"; abortController.abort(); }, 150_000);
    try {
      await streamDiagnostic(session.diagnostic_id, conversationWindow(nextMessages), (delta) => {
        received += delta;
        setStreamed(received);
      }, abortController.signal);
      if (!received.trim()) throw new Error("El modelo no devolvió contenido. Reintenta la pregunta.");
      setMessages([...nextMessages, { role: "assistant", content: received }]);
    } catch (cause) {
      setDraft(content);
      if (received) setIncomplete({ question: content, content: received });
      setError(abortReason.current === "stop" ? "Generación detenida. Puedes reintentar la pregunta."
        : abortReason.current === "timeout" ? "El modelo tardó demasiado. Tu pregunta está lista para reintentar."
        : cause instanceof Error ? cause.message : "No se pudo obtener una respuesta. Reintenta.");
    } finally {
      clearTimeout(timeout);
      controller.current = null;
      setPending(null);
      setStreamed("");
      onBusyChange(false);
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    }
  }

  return (
    <section aria-label="Asistente de diagnóstico" className="assistant-panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-sm dark:border-white/[.1] dark:bg-[#101311]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[.06] px-5 py-4 dark:border-white/[.08]">
        <div className="flex items-center gap-3">
          <SpecterMark className="size-9" />
          <div><h2 className="text-sm font-semibold">Asistente Specter</h2><p className="mt-0.5 text-xs text-zinc-500">Tu diagnóstico, explicado contigo</p></div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/[.08] px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500" />Solo lectura</span>
      </header>

      {session && !isDiagnosing ? (
        <details className="shrink-0 border-b border-black/[.05] bg-zinc-50/70 px-5 py-2.5 text-xs text-zinc-500 dark:border-white/[.06] dark:bg-white/[.02]">
          <summary className="cursor-pointer select-none"><span className="ml-1">Contexto del diagnóstico · {new Date(session.snapshot.collected_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} · {session.snapshot.os}</span></summary>
          <p className="mt-2 leading-relaxed">CPU {session.snapshot.cpu_percent}% · RAM {session.snapshot.ram_used_percent}% · Disco {session.snapshot.disk_used_percent}%
            {session.snapshot.cpu_temp_celsius !== null ? ` · ${session.snapshot.cpu_temp_celsius} °C` : " · Temperatura no disponible"}</p>
          <p className="mt-1 leading-relaxed">Captura del {new Date(session.snapshot.collected_at).toLocaleString("es-ES")}. Un nuevo diagnóstico actualiza el contexto y comienza otro chat.</p>
        </details>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={transcript} role="log" aria-label="Conversación sobre el diagnóstico" aria-live={busy ? "off" : "polite"} aria-busy={busy || isDiagnosing}
          onScroll={(event) => {
            const el = event.currentTarget;
            const near = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
            followScroll.current = near;
            setAtBottom(near);
          }}
          className="chat-transcript min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
          {isDiagnosing ? (
            <div role="status" className="flex min-h-full flex-col items-center justify-center py-8 text-center">
              <div className="relative"><SpecterMark className="size-14" /><span className="absolute -inset-3 rounded-3xl border border-emerald-500/15 motion-safe:animate-pulse" /></div>
              <h3 className="mt-7 text-lg font-semibold tracking-tight">Estoy analizando tu equipo</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-zinc-500">Correlacionando las métricas y los procesos para preparar un diagnóstico claro.</p>
              <div className="mt-5 flex items-center gap-2 rounded-full bg-emerald-500/[.07] px-4 py-2 text-xs text-emerald-700 dark:text-emerald-400"><Spinner />Esperando el diagnóstico de la IA…</div>
              <p className="mt-3 text-[11px] text-zinc-400">Puede tardar unos momentos. Tu sistema sigue sin cambios.</p>
            </div>
          ) : (
            <>
              {messages.length === 0 && !busy && !incomplete ? (
                <div className="mx-auto flex min-h-full max-w-md flex-col justify-center py-2">
                  <SpecterMark className="size-12" />
                  <p className="mt-6 text-[10px] font-semibold uppercase tracking-[.18em] text-emerald-600 dark:text-emerald-400">Observa. Entiende. Pregunta.</p>
                  <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{session ? "Hablemos de tu equipo." : "Entiende qué pasa\ncon tu equipo."}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-500">{session ? "Ya tengo tus mediciones. Pregúntame sobre el reporte o cuéntame qué síntomas estás notando." : "Un diagnóstico reúne las métricas del sistema y las convierte en una explicación. Después, puedes preguntarme lo que necesites."}</p>
                  {!session ? <button type="button" onClick={onRun} disabled={!canDiagnose} className="primary-button mt-5 self-start">{canDiagnose ? "Diagnosticar mi equipo" : "Conectando con el equipo…"}<span aria-hidden>↗</span></button> : null}
                  <div className="mt-7 space-y-2">
                    {SUGGESTIONS.map((item) => <button key={item.title} type="button" disabled={!session} onClick={() => void send(item.question)} className="group flex w-full items-center justify-between gap-3 rounded-xl border border-black/[.07] px-4 py-3 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[.03] disabled:cursor-default dark:border-white/[.08]">
                      <span><span className="block text-xs font-medium">{item.title}</span><span className="mt-1 block text-[11px] text-zinc-500">{item.hint}</span></span><span aria-hidden className="text-zinc-400 group-enabled:group-hover:text-emerald-600">↗</span>
                    </button>)}
                  </div>
                  {!session ? <p className="mt-3 text-[10px] text-zinc-400">Las preguntas se habilitan al completar tu primer diagnóstico.</p> : null}
                </div>
              ) : null}
              {messages.map((message, index) => <Message key={index} message={message} />)}
              {pending ? <Message message={{ role: "user", content: pending }} /> : null}
              {busy ? <div className="min-w-0">
                <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500" />Specter</p>
                {streamed ? <><MarkdownResponse content={streamed} /><span aria-hidden className="stream-cursor" /></> : <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/[.04] px-4 py-4 text-xs text-zinc-500"><span aria-hidden className="flex gap-1"><i className="thinking-dot" /><i className="thinking-dot" /><i className="thinking-dot" /></span>Specter está preparando una respuesta…</div>}
              </div> : null}
              {incomplete ? <><Message message={{ role: "user", content: incomplete.question }} /><div className="rounded-xl border border-amber-500/20 p-4"><p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-amber-600">Respuesta incompleta</p><MarkdownResponse content={incomplete.content} /></div></> : null}
            </>
          )}
        </div>
        {!atBottom && !isDiagnosing ? <button type="button" onClick={latest} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs shadow-md dark:border-white/10 dark:bg-zinc-800">↓ Ir al último mensaje</button> : null}
      </div>

      <form className="shrink-0 border-t border-black/[.05] bg-white px-4 pb-3 pt-3 dark:border-white/[.06] dark:bg-[#101311] sm:px-5" onSubmit={(event) => { event.preventDefault(); void send(draft); }}>
        {(error || diagnosticError) && !isDiagnosing ? <p role="alert" className="mb-3 rounded-lg bg-red-500/[.07] p-3 text-xs leading-relaxed text-red-700 dark:text-red-400">{error || diagnosticError}{!session ? <button type="button" onClick={onRun} disabled={!canDiagnose} className="ml-2 font-semibold underline">Reintentar diagnóstico</button> : null}</p> : null}
        <div className="rounded-xl border border-black/[.12] bg-zinc-50/70 p-3 transition-shadow focus-within:border-emerald-500/60 focus-within:ring-3 focus-within:ring-emerald-500/[.07] dark:border-white/[.12] dark:bg-white/[.03]">
          <label htmlFor="diagnostic-question" className="sr-only">Pregunta sobre tu diagnóstico</label>
          <textarea ref={input} id="diagnostic-question" rows={2} maxLength={2000} value={draft} disabled={!session || isDiagnosing} readOnly={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); } }}
            placeholder={isDiagnosing ? "Preparando tu diagnóstico…" : session ? "Pregunta algo o cuéntame qué estás notando…" : "Primero, genera un diagnóstico para conversar…"}
            className="block max-h-32 min-h-12 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-zinc-400 disabled:opacity-60" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-400"><span className="hidden sm:inline">Shift + Enter para otra línea · </span>{draft.length}/2000</span>
            {busy ? <button key="stop" type="button" onClick={(event) => { event.preventDefault(); abortReason.current = "stop"; controller.current?.abort(); }} className="secondary-button"><span aria-hidden>■</span>Detener</button>
              : <button key="send" type="submit" disabled={!session || isDiagnosing || !draft.trim()} className="primary-button">{error ? "Reintentar pregunta" : "Enviar pregunta"}<span aria-hidden>↑</span></button>}
          </div>
        </div>
        <p className="mt-2 text-center text-[10px] leading-relaxed text-zinc-400">Solo observa e interpreta. Puede equivocarse. El chat se pierde al recargar.</p>
      </form>
    </section>
  );
}

function Message({ message }: { message: ChatMessage }) {
  return message.role === "user" ? <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-zinc-100 px-4 py-3 dark:bg-white/[.07]"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p></div>
    : <div className="min-w-0"><p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500" />Specter</p><MarkdownResponse content={message.content} /></div>;
}
