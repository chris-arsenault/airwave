import { useEffect, useRef } from "react";

type EventHandler = (data: Record<string, unknown>) => void;

export function useSSE(handlers: Record<string, EventHandler>) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const handler = handlersRef.current[parsed.type];
        if (handler) handler(parsed.data);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => es.close();
  }, []);
}
