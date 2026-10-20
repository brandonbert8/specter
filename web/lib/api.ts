import type { ChatMessage, ChatResponse, DiagnosticSession, TelemetrySnapshot } from "./types";
import { consumeChatStream, withAbort } from "./chat-stream";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `La API respondió con ${response.status}.`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // La respuesta no era JSON; conservamos el mensaje por defecto.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function fetchTelemetry(): Promise<TelemetrySnapshot> {
  return request<TelemetrySnapshot>("/api/telemetry");
}

export function runDiagnostic(): Promise<DiagnosticSession> {
  return request<DiagnosticSession>("/api/diagnose", { method: "POST", signal: AbortSignal.timeout(150_000) });
}

export function askDiagnostic(
  diagnosticId: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ diagnostic_id: diagnosticId, messages }),
    signal,
  });
}

export async function streamDiagnostic(
  diagnosticId: string, messages: ChatMessage[], onDelta: (text: string) => void, signal: AbortSignal,
): Promise<void> {
  async function receive() {
    const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
      method: "POST", cache: "no-store", signal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ diagnostic_id: diagnosticId, messages }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { detail?: unknown } | null;
      throw new Error(typeof body?.detail === "string" ? body.detail : `La API respondió con ${response.status}.`);
    }
    await consumeChatStream(response, (delta) => { if (!signal.aborted) onDelta(delta); }, signal);
  }
  await withAbort(receive(), signal);
}
