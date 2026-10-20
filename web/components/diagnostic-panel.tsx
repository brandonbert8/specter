import type { AlertLevel, DiagnosticReport, DiagnosticSession } from "@/lib/types";
import { MarkdownResponse } from "@/components/markdown-response";

const ALERT_STYLES: Record<
  AlertLevel,
  { label: string; badge: string; dot: string }
> = {
  HEALTHY: {
    label: "Saludable",
    badge:
      "border-emerald-500/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  WARNING: {
    label: "Advertencia",
    badge:
      "border-amber-500/20 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  CRITICAL: {
    label: "Crítico",
    badge:
      "border-red-500/20 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    dot: "bg-red-500",
  },
};

type DiagnosticPanelProps = {
  report: DiagnosticSession | null;
  isLoading: boolean;
  error: string | null;
  generatedAt: Date | null;
  onRun: () => void;
  disabled?: boolean;
};

export function DiagnosticPanel({
  report,
  isLoading,
  error,
  generatedAt,
  onRun,
  disabled = false,
}: DiagnosticPanelProps) {
  return (
    <section className="rounded-xl border border-black/[.07] bg-white dark:border-white/[.09] dark:bg-[#0b0b0b]">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-medium">Diagnóstico</h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Análisis pasivo de la telemetría mediante el motor de Specter.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {generatedAt ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              {generatedAt.toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
          {report && !isLoading ? (
            <button
              type="button"
              onClick={onRun}
              disabled={disabled}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[.04] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-100"
            >
              Repetir análisis
            </button>
          ) : null}
        </div>
      </header>

      <div className="border-t border-black/[.06] p-5 dark:border-white/[.07]">
        {isLoading ? <DiagnosticSkeleton /> : null}

        {!isLoading && error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-50 p-4 dark:bg-red-500/10">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              No se pudo completar el diagnóstico
            </p>
            <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
              {error}
            </p>
            <button
              type="button"
              onClick={onRun}
              disabled={disabled}
              className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {!isLoading && !error && report ? (
          <Report report={report} />
        ) : null}

        {!isLoading && !error && !report ? (
          <EmptyState onRun={onRun} disabled={disabled} />
        ) : null}
      </div>
    </section>
  );
}

function Report({ report }: { report: DiagnosticReport }) {
  const alert = ALERT_STYLES[report.alert_level];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${alert.badge}`}
        >
          <span className={`size-1.5 rounded-full ${alert.dot}`} />
          {alert.label}
        </span>
      </div>

      <MarkdownResponse content={report.summary} />

      <div className="grid gap-6 md:grid-cols-2">
        <ReportList
          title="Causas probables"
          items={report.probable_causes}
          emptyLabel="No se identificaron causas relevantes."
        />
        <ReportList
          title="Recomendaciones"
          items={report.recommendations}
          emptyLabel="No hay recomendaciones por ahora."
        />
      </div>

      <details className="rounded-lg border border-black/[.07] p-4 text-sm dark:border-white/[.09]">
        <summary className="cursor-pointer font-medium">Evidencia y alcance del diagnóstico</summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <ReportList title="Mediciones observadas" items={report.evidence ?? []} emptyLabel="Consulta las métricas de la captura en el chat." />
          <ReportList title="Límites del análisis" items={report.limitations ?? []} emptyLabel="Una captura puntual no confirma fallos persistentes." />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Cobertura: CPU, RAM, espacio del disco y procesos; temperatura si el sensor está disponible.
          Sin S.M.A.R.T. ni registros de eventos. El espacio ocupado no indica la salud física del disco.
        </p>
      </details>
    </div>
  );
}

function ReportList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div>
      <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
        {title}
      </h3>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          {emptyLabel}
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li key={item} className="flex gap-3 text-sm leading-relaxed">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-black/[.08] font-mono text-[10px] text-zinc-500 dark:border-white/[.1] dark:text-zinc-400">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1"><MarkdownResponse content={item} /></div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EmptyState({ onRun, disabled }: { onRun: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-black/[.12] px-6 py-10 text-center dark:border-white/[.14]">
      <span className="flex size-9 items-center justify-center rounded-full border border-black/[.08] dark:border-white/[.12]">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-4 text-zinc-500 dark:text-zinc-400"
        >
          <path d="M3 12h4l2.5-6 5 12 2.5-6H21" />
        </svg>
      </span>
      <p className="mt-3 text-sm font-medium">Aún no hay un diagnóstico</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        Analiza el estado actual del equipo para obtener una explicación y
        recomendaciones sin modificar el sistema.
      </p>
      <button
        type="button"
        onClick={onRun}
        disabled={disabled}
        className="mt-4 rounded-md bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Ejecutar diagnóstico
      </button>
    </div>
  );
}

function DiagnosticSkeleton() {
  return (
    <div aria-live="polite" className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          className="size-4 animate-spin"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2"
            strokeOpacity="0.2"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Analizando telemetría con el motor de diagnóstico…
      </div>
      <div className="space-y-2.5">
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-black/[.06] dark:bg-white/[.08]" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-black/[.06] dark:bg-white/[.08]" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column} className="space-y-2.5">
            <div className="h-2.5 w-24 animate-pulse rounded-full bg-black/[.06] dark:bg-white/[.08]" />
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-3 w-full animate-pulse rounded-full bg-black/[.04] dark:bg-white/[.06]"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
