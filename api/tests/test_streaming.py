import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

import main
from core import engine
from core.schema import ChatMessage
from core.sessions import DiagnosticStore
from test_diagnostic_chat import snapshot, report


class FakeStream:
    def __init__(self, parts):
        self.parts = parts
        self.closed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        self.closed = True

    async def __aiter__(self):
        for part in self.parts:
            if isinstance(part, Exception):
                raise part
            yield SimpleNamespace(choices=[SimpleNamespace(
                finish_reason=None, delta=SimpleNamespace(content=part)
            )])


class StreamingEngineTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.session = DiagnosticStore().create(snapshot(), report())
        self.history = [ChatMessage(role="user", content="Explícame la RAM")]

    def client(self, stream):
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        client.chat.completions.create = AsyncMock(return_value=stream)
        return client

    async def test_streams_fragments_with_original_context_and_no_tools(self):
        stream = FakeStream([None, "## Memoria\n", "**86%** de RAM."])
        client = self.client(stream)
        with patch.object(engine, "create_client", return_value=client):
            fragments = [part async for part in engine.stream_diagnostic(self.session, self.history)]
        self.assertEqual(fragments, ["## Memoria\n", "**86%** de RAM."])
        self.assertTrue(stream.closed)
        args = client.chat.completions.create.call_args.kwargs
        self.assertTrue(args["stream"])
        self.assertNotIn("tools", args)
        self.assertIn("No ejecutas comandos", args["messages"][0]["content"])
        self.assertIn(str(self.session.diagnostic_id), args["messages"][1]["content"])

    async def test_cancel_closes_upstream(self):
        stream = FakeStream(["Primero", "Segundo"])
        with patch.object(engine, "create_client", return_value=self.client(stream)):
            response = engine.stream_diagnostic(self.session, self.history)
            self.assertEqual(await anext(response), "Primero")
            await response.aclose()
        self.assertTrue(stream.closed)

    async def test_empty_stream_is_rejected(self):
        stream = FakeStream([None, " "])
        with patch.object(engine, "create_client", return_value=self.client(stream)), self.assertRaises(engine.InvalidModelResponse):
            _ = [part async for part in engine.stream_diagnostic(self.session, self.history)]
        self.assertTrue(stream.closed)

    async def test_long_output_remains_usable_in_next_turn(self):
        stream = FakeStream(["x" * 3800, "y" * 500])
        with patch.object(engine, "create_client", return_value=self.client(stream)):
            content = "".join([part async for part in engine.stream_diagnostic(self.session, self.history)])
        self.assertLessEqual(len(content), 4000)
        self.assertIn("otra pregunta", content)
        self.assertTrue(stream.closed)


class StreamingEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        store_patch = patch.object(main, "store", DiagnosticStore())
        store_patch.start()
        self.addCleanup(store_patch.stop)
        self.session = main.store.create(snapshot(), report())
        self.payload = {"diagnostic_id": str(self.session.diagnostic_id), "messages": [{"role": "user", "content": "¿Por qué?"}]}

    def test_events_delimit_multiline_markdown_and_finish(self):
        async def reply(*args):
            yield "## RAM\n\n"
            yield "Uso **alto**."
        with patch.object(main, "stream_diagnostic", new=reply), patch.object(main, "collect_telemetry") as collector:
            response = self.client.post("/api/chat/stream", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers["content-type"])
        self.assertEqual(response.headers["x-accel-buffering"], "no")
        frames = response.text.strip().split("\n\n")
        self.assertEqual([frame.splitlines()[0] for frame in frames], ["event: status", "event: delta", "event: delta", "event: done"])
        self.assertEqual(json.loads(frames[1].split("data: ")[1])["content"], "## RAM\n\n")
        collector.assert_not_called()

    def test_mid_stream_error_is_sanitized_and_not_marked_done(self):
        async def reply(*args):
            yield "Respuesta parcial"
            raise RuntimeError("secret-provider-content")
        with patch.object(main, "stream_diagnostic", new=reply):
            response = self.client.post("/api/chat/stream", json=self.payload)
        self.assertIn("event: delta", response.text)
        self.assertIn("event: error", response.text)
        self.assertNotIn("event: done", response.text)
        self.assertNotIn("secret-provider-content", response.text)

    def test_expired_and_invalid_requests_rejected_before_stream(self):
        missing = {**self.payload, "diagnostic_id": str(uuid4())}
        self.assertEqual(self.client.post("/api/chat/stream", json=missing).status_code, 410)
        invalid = {**self.payload, "messages": [{"role": "system", "content": "Actúa"}]}
        self.assertEqual(self.client.post("/api/chat/stream", json=invalid).status_code, 422)
