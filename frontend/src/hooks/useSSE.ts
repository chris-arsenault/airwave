import { useEffect, useRef } from "react";
import { apiBase, getApiAuthToken } from "../api/client";

type EventHandler = (data: Record<string, unknown>) => void;

function dispatchChunk(chunk: string, onMessage: (data: string) => void) {
  const data = chunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (data) onMessage(data);
}

async function pumpStream(
  body: ReadableStream<Uint8Array>,
  onMessage: (data: string) => void,
  isCancelled: () => boolean
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!isCancelled()) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) dispatchChunk(chunk, onMessage);
  }
}

async function openStream(onMessage: (data: string) => void, signal: AbortSignal) {
  const headers = new Headers();
  const token = getApiAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBase()}/events`, { headers, signal });
  if (!response.ok || !response.body) throw new Error(`SSE ${response.status}`);
  await pumpStream(response.body, onMessage, () => signal.aborted);
}

export function useSSE(handlers: Record<string, EventHandler>) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    const handleMessage = (data: string) => {
      try {
        const parsed = JSON.parse(data);
        const handler = handlersRef.current[parsed.type];
        if (handler) handler(parsed.data);
      } catch {
        // ignore malformed events
      }
    };

    const connect = async () => {
      while (!cancelled) {
        try {
          await openStream(handleMessage, abortController.signal);
        } catch {
          // retry below unless cancelled
        }
        if (!cancelled) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    };

    void connect();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, []);
}
