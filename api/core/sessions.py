"""Contextos efímeros del diagnóstico; nunca se aceptan mediciones del navegador."""

from collections import OrderedDict
from datetime import datetime, timezone
from time import monotonic
from uuid import UUID, uuid4

from core.schema import DiagnosticReport, DiagnosticSession, TelemetrySnapshot


class DiagnosticStore:
    # Uso local con un único worker. No guarda conversaciones ni escribe al disco.
    def __init__(self, ttl_seconds: int = 3600, max_sessions: int = 100):
        self.ttl_seconds = ttl_seconds
        self.max_sessions = max_sessions
        self._sessions: OrderedDict[UUID, tuple[float, DiagnosticSession]] = OrderedDict()

    def _prune(self):
        now = monotonic()
        while self._sessions:
            key, (expires, _) = next(iter(self._sessions.items()))
            if expires > now:
                break
            del self._sessions[key]

    def create(self, snapshot: TelemetrySnapshot, report: DiagnosticReport) -> DiagnosticSession:
        self._prune()
        session = DiagnosticSession(
            **report.model_dump(), diagnostic_id=uuid4(),
            generated_at=datetime.now(timezone.utc), snapshot=snapshot,
        )
        self._sessions[session.diagnostic_id] = (monotonic() + self.ttl_seconds, session)
        while len(self._sessions) > self.max_sessions:
            self._sessions.popitem(last=False)
        return session

    def get(self, diagnostic_id: UUID) -> DiagnosticSession | None:
        self._prune()
        entry = self._sessions.get(diagnostic_id)
        return entry[1] if entry else None
