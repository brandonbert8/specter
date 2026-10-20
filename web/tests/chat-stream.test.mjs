import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeChatStream, withAbort } from '../lib/chat-stream.ts';

function response(chunks) {
  return new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); },
  }));
}
const encode = (value) => new TextEncoder().encode(value);
const event = (kind, payload) => `event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`;

test('renders deltas before completion, handles UTF-8 and frames split at every byte', async () => {
  const bytes = encode(': ping\n\n' + event('status', { status: 'waiting' }) + event('delta', { content: '## Diagnóstico 🟢\n' }) + event('delta', { content: '**Memoria**' }) + event('done', {}));
  const deltas = [];
  await consumeChatStream(response(Array.from(bytes, (byte) => new Uint8Array([byte]))), part => deltas.push(part));
  assert.deepEqual(deltas, ['## Diagnóstico 🟢\n', '**Memoria**']);
});

test('accepts CRLF and multiple frames in one network chunk', async () => {
  const text = (event('delta', { content: 'hola' }) + event('done', {})).replaceAll('\n', '\r\n');
  const deltas = [];
  await consumeChatStream(response([encode(text)]), part => deltas.push(part));
  assert.deepEqual(deltas, ['hola']);
});

test('preserves received fragments but rejects a mid-stream error', async () => {
  const deltas = [];
  const text = event('delta', { content: 'Parcial' }) + event('error', { message: 'El proveedor falló' });
  await assert.rejects(consumeChatStream(response([encode(text)]), part => deltas.push(part)), /El proveedor falló/);
  assert.deepEqual(deltas, ['Parcial']);
});

test('does not silently treat a disconnected stream as a completed answer', async () => {
  await assert.rejects(consumeChatStream(response([encode(event('delta', { content: 'Parcial' }))]), () => {}), /interrumpió/);
});

test('receives a first fragment while the network stream is still open', async () => {
  let streamController;
  let delivered;
  const first = new Promise(resolve => { delivered = resolve; });
  const stream = new ReadableStream({start(controller) { streamController = controller; }});
  const reading = consumeChatStream(new Response(stream), delivered);
  streamController.enqueue(encode(event('delta', { content: 'En vivo' })));
  assert.equal(await first, 'En vivo');
  streamController.enqueue(encode(event('done', {})));
  streamController.close();
  await reading;
});

test('stop cancels an open body reader even if the transport ignores fetch cancellation', async () => {
  const abortController = new AbortController();
  let delivered;
  let cancelled = false;
  const first = new Promise(resolve => { delivered = resolve; });
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(encode(event('delta', {content:'Parcial'}))); },
    cancel() { cancelled = true; },
  });
  const reading = consumeChatStream(new Response(stream), delivered, abortController.signal);
  assert.equal(await first, 'Parcial');
  abortController.abort();
  await assert.rejects(reading, {name:'AbortError'});
  assert.equal(cancelled, true);
});

test('stop does not wait for the server to acknowledge transport cancellation', async () => {
  const abortController = new AbortController();
  let acknowledge;
  const stream = new ReadableStream({cancel() { return new Promise(resolve => { acknowledge = resolve; }); }});
  const reading = consumeChatStream(new Response(stream), () => {}, abortController.signal);
  abortController.abort();
  await assert.rejects(reading, {name:'AbortError'});
  acknowledge();
});


test('cancellation releases the UI while the transport is still waiting for headers', async () => {
  const abortController = new AbortController();
  const operation = withAbort(new Promise(() => {}), abortController.signal);
  abortController.abort();
  await assert.rejects(operation, {name:'AbortError'});
});
