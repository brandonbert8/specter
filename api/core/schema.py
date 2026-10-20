from datetime import datetime, timezone
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class ProcessInfo(BaseModel):
    pid: int
    name: str
    cpu_percent: float
    memory_percent: float

class TelemetrySnapshot(BaseModel):
    collected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    os: str
    cpu_percent: float
    ram_total_gb: float
    ram_used_percent: float
    disk_total_gb: float
    disk_used_percent: float
    cpu_temp_celsius: Optional[float] = None
    top_cpu_processes: List[ProcessInfo]
    top_ram_processes: List[ProcessInfo]

class DiagnosticReport(BaseModel):
    summary: str = Field(description="Explicación concisa y accesible del estado general del equipo.")
    alert_level: Literal["HEALTHY", "WARNING", "CRITICAL"]
    probable_causes: List[str] = Field(description="Posibles causas técnicas identificadas.")
    recommendations: List[str] = Field(description="Recomendaciones preventivas o de revisión sin alterar el sistema.")
    evidence: List[str] = Field(default_factory=list, description="Mediciones que sustentan las hipótesis.")
    limitations: List[str] = Field(default_factory=list, description="Datos faltantes y límites del diagnóstico.")


class DiagnosticSession(DiagnosticReport):
    diagnostic_id: UUID
    generated_at: datetime
    snapshot: TelemetrySnapshot


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)

    @field_validator("content")
    @classmethod
    def non_empty_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("El mensaje no puede estar vacío.")
        return value.strip()


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    diagnostic_id: UUID
    messages: List[ChatMessage] = Field(min_length=1, max_length=21)

    @model_validator(mode="after")
    def valid_conversation(self):
        if self.messages[-1].role != "user":
            raise ValueError("La conversación debe terminar con una pregunta del usuario.")
        for index, message in enumerate(self.messages):
            if message.role != ("user" if index % 2 == 0 else "assistant"):
                raise ValueError("Los mensajes deben alternar entre usuario y asistente.")
        if sum(len(message.content) for message in self.messages) > 32000:
            raise ValueError("La conversación supera el límite de contexto.")
        return self


class ChatResponse(BaseModel):
    diagnostic_id: UUID
    message: str
