import os
import logging
import json
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import APIError, APITimeoutError, RateLimitError
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

load_dotenv(Path(__file__).resolve().parent / ".env")

from core.schema import TelemetrySnapshot, DiagnosticSession, ChatRequest, ChatResponse
from core.collector import collect_telemetry
from core.engine import analyze_telemetry, answer_diagnostic, stream_diagnostic, EngineConfigurationError, InvalidModelResponse
from core.sessions import DiagnosticStore

app = FastAPI(title="Specter Diagnostic API", version="1.1.0")
store = DiagnosticStore()
logger = logging.getLogger(__name__)


def engine_http_error(error: Exception) -> HTTPException:
    if isinstance(error, EngineConfigurationError):
        return HTTPException(503, "Configura OPENROUTER_API_KEY en api/.env y reinicia la API.")
    if isinstance(error, APITimeoutError):
        return HTTPException(504, "El modelo tardó demasiado en responder. Reintenta en unos momentos.")
    if isinstance(error, RateLimitError):
        return HTTPException(429, "El proveedor alcanzó su límite de solicitudes. Espera antes de reintentar.")
    if isinstance(error, (APIError, ValidationError, InvalidModelResponse)):
        return HTTPException(502, "El proveedor no pudo completar una respuesta válida. Reintenta o revisa el modelo configurado.")
    # No filtrar cuerpos del proveedor, claves o telemetría a respuestas o registros.
    logger.error("Fallo de diagnóstico: %s", type(error).__name__)
    return HTTPException(500, "No se pudo completar la consulta. Reintenta en unos momentos.")

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "online"}

@app.get("/api/telemetry", response_model=TelemetrySnapshot)
def get_telemetry():
    return collect_telemetry()

@app.post("/api/diagnose", response_model=DiagnosticSession)
async def run_diagnose():
    try:
        snapshot = await run_in_threadpool(collect_telemetry)
        report = await analyze_telemetry(snapshot)
        return store.create(snapshot, report)
    except Exception as e:
        raise engine_http_error(e) from None


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    session = store.get(request.diagnostic_id)
    if session is None:
        raise HTTPException(410, "El contexto del diagnóstico expiró o ya no está disponible. Ejecuta un nuevo diagnóstico.")
    try:
        message = await answer_diagnostic(session, request.messages)
        return ChatResponse(diagnostic_id=session.diagnostic_id, message=message)
    except Exception as e:
        raise engine_http_error(e) from None


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    session = store.get(request.diagnostic_id)
    if session is None:
        raise HTTPException(410, "El contexto del diagnóstico expiró o ya no está disponible. Ejecuta un nuevo diagnóstico.")

    def event(kind: str, payload: dict) -> str:
        return f"event: {kind}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    async def events():
        yield event("status", {"status": "waiting"})
        try:
            async for delta in stream_diagnostic(session, request.messages):
                yield event("delta", {"content": delta})
            yield event("done", {"diagnostic_id": str(session.diagnostic_id)})
        except Exception as error:
            # Las cabeceras ya fueron enviadas: el fallo se notifica dentro del stream.
            failure = engine_http_error(error)
            yield event("error", {"message": failure.detail, "status": failure.status_code})

    return StreamingResponse(events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
