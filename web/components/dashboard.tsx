"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, fetchTelemetry, runDiagnostic } from "@/lib/api";
import type { DiagnosticSession, TelemetrySnapshot } from "@/lib/types";
import { formatPercent } from "@/lib/format";
import { DiagnosticPanel } from "./diagnostic-panel";
import { DiagnosticChat } from "./diagnostic-chat";
import { MetricCard } from "./metric-card";
import { ProcessTable } from "./process-table";
import { SpecterMark, Spinner } from "./specter-mark";

const REFRESH_INTERVAL_MS = 10_000;

export function Dashboard() {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [report, setReport] = useState<DiagnosticSession | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isChatBusy, setIsChatBusy] = useState(false);
  const [view, setView] = useState<"system" | "assistant">("assistant");
  const collecting = useRef(false);
  const diagnosing = useRef(false);

  const loadTelemetry = useCallback(async () => {
    if (collecting.current) return;
    collecting.current = true;
    try {
      const snapshot = await fetchTelemetry();
      setTelemetry(snapshot);
      setTelemetryError(null);
      setUpdatedAt(new Date(snapshot.collected_at));
    } catch {
      setTelemetryError("No se pudo leer el equipo. Comprueba que la API esté en ejecución.");
    } finally {
      collecting.current = false;
      setIsRefreshing(false);
    }
  }, []);

  const handleRefresh = useCallback(() => { setIsRefreshing(true); void loadTelemetry(); }, [loadTelemetry]);

  useEffect(() => {
    const initial = setTimeout(() => void loadTelemetry(), 0);
    const interval = setInterval(() => { if (document.visibilityState === "visible") void loadTelemetry(); }, REFRESH_INTERVAL_MS);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [loadTelemetry]);

  const handleDiagnose = useCallback(async () => {
    if (diagnosing.current || isChatBusy) return;
    diagnosing.current = true;
    setIsDiagnosing(true);
    setReportError(null);
    setView("assistant");
    try {
      const nextReport = await runDiagnostic();
      setReport(nextReport);
      void loadTelemetry();
    } catch (error) {
      setReportError(error instanceof Error && error.name === "TimeoutError" ? "El diagnóstico tardó demasiado. Puedes reintentar."
        : error instanceof Error ? error.message : "El motor no devolvió una respuesta válida.");
    } finally {
      diagnosing.current = false;
      setIsDiagnosing(false);
    }
  }, [loadTelemetry, isChatBusy]);

  const connected = !!telemetry && !telemetryError;
  const canDiagnose = !!telemetry && !isDiagnosing && !isChatBusy;

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f5f7f6] text-zinc-900 dark:bg-[#090c0a] dark:text-zinc-100">
      <header className="shrink-0 border-b border-black/[.06] bg-white/90 dark:border-white/[.08] dark:bg-[#101311]">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><SpecterMark className="size-8" /><div><p className="text-base font-semibold tracking-tight">Specter<span className="ml-2 hidden text-xs font-normal text-zinc-400 sm:inline">/ Workspace</span></p><p className="hidden text-[10px] text-zinc-500 sm:block">Diagnóstico inteligente. Siempre observador.</p></div></div>
          <div className="flex items-center gap-3 sm:gap-5">
            <span role="status" className="flex items-center gap-1.5 text-[11px] text-zinc-500"><span className={`size-1.5 rounded-full ${connected ? "bg-emerald-500" : telemetryError ? "bg-red-500" : "bg-amber-500 motion-safe:animate-pulse"}`} /><span className="hidden sm:inline">{connected ? "Equipo conectado" : telemetryError ? "Sin conexión" : "Conectando"}</span></span>
            <button type="button" onClick={() => void handleDiagnose()} disabled={!canDiagnose} className="primary-button" title={isChatBusy ? "Espera o detén la respuesta antes de iniciar otro diagnóstico" : undefined}>
              {isDiagnosing ? <Spinner /> : <span aria-hidden className="text-base leading-none">+</span>}{isDiagnosing ? "Analizando…" : report ? "Nuevo diagnóstico" : "Diagnosticar equipo"}
            </button>
          </div>
        </div>
      </header>

      <nav aria-label="Vista del espacio de diagnóstico" className="grid shrink-0 grid-cols-2 gap-1 border-b border-black/[.06] bg-white p-2 dark:border-white/[.08] dark:bg-[#101311] lg:hidden">
        {([['system', 'Sistema'], ['assistant', 'Asistente']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key} className={`flex min-h-9 items-center justify-center gap-2 rounded-lg text-xs font-medium transition-colors ${view === key ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'text-zinc-500'}`}>{label}{key === 'assistant' && (isChatBusy || isDiagnosing) ? <Spinner className="size-3" /> : null}</button>)}
      </nav>

      <main className="mx-auto grid min-h-0 w-full max-w-[1680px] flex-1 gap-5 p-3 sm:p-5 lg:grid-cols-[minmax(350px,.9fr)_minmax(0,1.1fr)] lg:gap-6 lg:p-6">
        <section aria-label="Telemetría y reporte" className={`${view === 'system' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col lg:flex`}>
          <div className="mb-4 flex shrink-0 items-center justify-between gap-3 px-1">
            <div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-zinc-400">Tu equipo, en contexto</p><h1 className="mt-1 text-lg font-semibold tracking-tight">Estado del sistema</h1></div>
            <button type="button" aria-label="Actualizar telemetría" onClick={handleRefresh} disabled={isRefreshing} className="secondary-button">{isRefreshing ? <Spinner className="size-3.5" /> : <span aria-hidden>↻</span>}Actualizar</button>
          </div>
          <div className="system-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
            {telemetryError ? <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/[.06] p-4 text-xs leading-relaxed text-amber-800 dark:text-amber-300">{telemetryError}<button type="button" onClick={handleRefresh} className="ml-2 font-medium underline">Reintentar conexión</button></div> : null}
            <div className="flex items-center justify-between gap-2 px-1 text-[10px] text-zinc-400"><span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-400'}`} />{telemetry?.os || "Esperando telemetría"} · Lectura en vivo</span><span className="tabular-nums">{updatedAt ? updatedAt.toLocaleTimeString("es-ES") : "Conectando…"}</span></div>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="CPU" value={telemetry ? Math.round(telemetry.cpu_percent).toString() : "—"} unit={telemetry ? "%" : undefined} detail="Uso del procesador" percent={telemetry?.cpu_percent} />
              <MetricCard label="Memoria RAM" value={telemetry ? formatPercent(telemetry.ram_used_percent, 0).replace("%", "") : "—"} unit={telemetry ? "%" : undefined} detail={telemetry ? `${telemetry.ram_total_gb} GB totales` : "Esperando lectura"} percent={telemetry?.ram_used_percent} />
              <MetricCard label="Disco" value={telemetry ? formatPercent(telemetry.disk_used_percent, 0).replace("%", "") : "—"} unit={telemetry ? "%" : undefined} detail={telemetry ? `${telemetry.disk_total_gb} GB · ocupación` : "Esperando lectura"} percent={telemetry?.disk_used_percent} />
              <MetricCard label="Temperatura" value={telemetry?.cpu_temp_celsius != null ? Math.round(telemetry.cpu_temp_celsius).toString() : "—"} unit={telemetry?.cpu_temp_celsius != null ? "°C" : undefined} detail={telemetry?.cpu_temp_celsius != null ? "Sensor del procesador" : "Sensor no disponible"} />
            </div>
            <DiagnosticPanel report={report} isLoading={isDiagnosing} error={reportError} generatedAt={report ? new Date(report.generated_at) : null} onRun={() => void handleDiagnose()} disabled={!canDiagnose} />
            <details className="rounded-xl border border-black/[.07] bg-white dark:border-white/[.09] dark:bg-[#0b0b0b]"><summary className="cursor-pointer px-5 py-4 text-xs font-medium">Procesos con mayor consumo</summary><div className="space-y-3 p-3 pt-0"><ProcessTable title="Procesos con más CPU" processes={telemetry?.top_cpu_processes ?? []} metric="cpu" /><ProcessTable title="Procesos con más memoria" processes={telemetry?.top_ram_processes ?? []} metric="ram" /></div></details>
            <details className="px-1 pb-3 text-[11px] leading-relaxed text-zinc-500"><summary className="cursor-pointer">Privacidad y alcance de Specter</summary><p className="mt-2">Observa el equipo donde corre la API. Al diagnosticar o conversar, las métricas, los nombres de procesos y tus preguntas se envían al modelo vía OpenRouter. No ejecuta comandos ni modifica el sistema. Sin S.M.A.R.T. ni registros de eventos.</p><a href={`${API_BASE_URL}/docs`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-emerald-700 underline underline-offset-2 dark:text-emerald-400">Documentación de la API ↗</a></details>
          </div>
        </section>
        <div className={`${view === 'assistant' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col lg:flex`}>
          <DiagnosticChat key={report?.diagnostic_id ?? 'initial'} session={report} isDiagnosing={isDiagnosing} diagnosticError={reportError} canDiagnose={canDiagnose} onRun={() => void handleDiagnose()} onBusyChange={setIsChatBusy} />
        </div>
      </main>
    </div>
  );
}
