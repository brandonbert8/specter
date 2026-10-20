/** Libera la UI al cancelar, incluso si el transporte tarda en cerrar la conexión. */
export async function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  let cancel: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

/** Lee SSE aunque las tramas y caracteres UTF-8 lleguen divididos entre paquetes. */
export async function consumeChatStream(response: Response, onDelta: (text: string) => void, signal?: AbortSignal): Promise<void> {
  if (!response.body) throw new Error("El navegador no pudo abrir la respuesta en vivo.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });

  function frame(raw: string) {
    const lines = raw.split(/\r?\n/);
    const kind = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    const payload = JSON.parse(data) as { content?: string; message?: string };
    if (kind === "error") throw new Error(payload.message || "La respuesta se interrumpió. Reintenta la pregunta.");
    if (kind === "delta" && typeof payload.content === "string") onDelta(payload.content);
    if (kind === "done") finished = true;
  }

  try {
    while (!finished) {
      if (signal?.aborted) throw signal.reason;
      const { value, done } = await reader.read();
      if (signal?.aborted) throw signal.reason;
      buffer += decoder.decode(value, { stream: !done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer)) !== null) {
        if (signal?.aborted) throw signal.reason;
        frame(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (finished) break;
      }
      if (done) {
        if (buffer.trim()) frame(buffer);
        break;
      }
    }
    if (!finished) throw new Error("La conexión se interrumpió antes de completar la respuesta. Puedes reintentar.");
  } finally {
    signal?.removeEventListener("abort", abort);
    // Algunos transportes tardan en confirmar el cierre; no bloquear la interfaz.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
