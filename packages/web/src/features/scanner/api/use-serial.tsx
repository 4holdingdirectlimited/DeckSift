import { reportSerialEvent } from "@/features/notifications/api/notification-settings";
import { EXPECTED_PROTO_VERSION } from "@/features/scanner/constants";
import type {
  SerialContextValue,
  SerialMessageListener,
} from "@/features/scanner/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

export type { SerialMessageListener } from "@/features/scanner/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface PendingWaiter {
  match: (msg: unknown) => boolean;
  resolve: (msg: unknown, raw: string) => void;
}

const SerialContext = createContext<SerialContextValue | null>(null);

export function SerialProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isWs, setIsWs] = useState(false);
  const portRef = useRef<SerialPort | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );
  const writableRef = useRef<WritableStream<Uint8Array> | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const bufferRef = useRef("");
  const pendingRef = useRef<PendingWaiter[]>([]);
  const nextCmdIdRef = useRef(1);
  const listenersRef = useRef(new Set<SerialMessageListener>());
  const disconnectingRef = useRef<Promise<void> | null>(null);
  const preTestHookRef = useRef<(() => Promise<void>) | null>(null);

  const decoderRef = useRef(new TextDecoder());

  // A transport-agnostic message pipeline: parse one incoming JSON line and
  // deliver it to subscribers + id-matched waiters. Used by both the USB serial
  // reader and the WebSocket message handler, so the two transports are
  // indistinguishable to every consumer of this provider.
  const processLine = useCallback((trimmed: string) => {
    try {
      const parsed = JSON.parse(trimmed);
      for (const listener of listenersRef.current) {
        listener(parsed);
      }

      // Deliver the message to every waiter whose predicate matches
      // (e.g. waiters expecting a specific command id), then drop it.
      const remaining: PendingWaiter[] = [];
      for (const waiter of pendingRef.current) {
        if (waiter.match(parsed)) waiter.resolve(parsed, trimmed);
        else remaining.push(waiter);
      }
      pendingRef.current = remaining;
    } catch {
      console.warn("[Serial] Non-JSON message:", trimmed);
    }
  }, []);

  const startReading = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      onEnd?: () => void,
    ) => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            bufferRef.current += decoderRef.current.decode(value, {
              stream: true,
            });
            const lines = bufferRef.current.split("\n");
            bufferRef.current = lines.pop() || "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              console.log("[Serial] ←", trimmed); // eslint-disable-line no-console -- hardware debug trace
              processLine(trimmed);
            }
          }
        }
      } catch (e) {
        // Reader was cancelled (disconnect) - expected
        if (!(e instanceof DOMException && e.name === "NetworkError")) {
          console.error("[Serial] Read error:", e);
        }
      } finally {
        onEnd?.();
      }
    },
    [processLine],
  );

  const waitForLine = useCallback((timeoutMs: number): Promise<string> => {
    return new Promise<string>((resolve) => {
      let settled = false;

      const finish = (line: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(line);
      };

      const waiter: PendingWaiter = {
        // "Next line wins" semantics — used to consume the boot message on
        // connect (commands themselves are matched by id).
        match: () => true,
        resolve: (_msg, raw) => finish(raw),
      };

      pendingRef.current.push(waiter);
      const timer = setTimeout(() => {
        pendingRef.current = pendingRef.current.filter((w) => w !== waiter);
        finish("");
      }, timeoutMs);
    });
  }, []);

  const waitForId = useCallback(
    (id: number, timeoutMs: number): Promise<unknown | null> => {
      return new Promise<unknown | null>((resolve) => {
        let settled = false;

        const finish = (msg: unknown | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(msg);
        };

        const waiter: PendingWaiter = {
          match: (msg) => isRecord(msg) && msg.id === id,
          resolve: (msg) => finish(msg),
        };

        pendingRef.current.push(waiter);
        const timer = setTimeout(() => {
          pendingRef.current = pendingRef.current.filter((w) => w !== waiter);
          finish(null);
        }, timeoutMs);
      });
    },
    [],
  );

  const sendCommand = useCallback((data: string): Promise<boolean> => {
    // Wi-Fi transport: WebSocket is full-duplex, so no write queue needed.
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        console.log("[WiFi] →", data.trim()); // eslint-disable-line no-console -- hardware debug trace
        ws.send(data);
        return Promise.resolve(true);
      } catch {
        return Promise.resolve(false);
      }
    }

    // USB transport: serial writes are serialized through a promise queue.
    if (!portRef.current || !writableRef.current) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      writeQueueRef.current = writeQueueRef.current.then(async () => {
        if (!writableRef.current) {
          resolve(false);
          return;
        }
        const writer = writableRef.current.getWriter();
        try {
          console.log("[Serial] →", data.trim()); // eslint-disable-line no-console -- hardware debug trace
          await writer.write(new TextEncoder().encode(data));
          resolve(true);
        } catch {
          resolve(false);
        } finally {
          writer.releaseLock();
        }
      });
    });
  }, []);

  const sendTest = useCallback(async (): Promise<boolean> => {
    const id = nextCmdIdRef.current++;
    const sent = await sendCommand(JSON.stringify({ test: true, id }) + "\n");
    if (!sent) return false;

    const response = await waitForId(id, 10000);
    if (!response) return false;

    return isRecord(response) && response.status === "test_complete";
  }, [sendCommand, waitForId]);

  const disconnect = useCallback(() => {
    const port = portRef.current;
    const reader = readerRef.current;
    const ws = wsRef.current;

    // Clear refs and state immediately
    portRef.current = null;
    readerRef.current = null;
    writableRef.current = null;
    wsRef.current = null;
    writeQueueRef.current = Promise.resolve();
    setIsConnected(false);
    setIsReady(false);
    setIsWs(false);

    // Reject any outstanding waiters
    for (const waiter of pendingRef.current) {
      waiter.resolve(null, "");
    }
    pendingRef.current = [];
    bufferRef.current = "";

    // Async cleanup - stored so connect() can await it
    const cleanup = (async () => {
      if (reader) {
        try {
          await reader.cancel();
        } catch {}
      }

      if (port) {
        try {
          await port.close();
        } catch {}
      }

      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    })();

    disconnectingRef.current = cleanup.finally(() => {
      disconnectingRef.current = null;
    });

    return cleanup;
  }, []);

  const openPort = useCallback(
    async (port: SerialPort): Promise<boolean> => {
      if (!port.readable || !port.writable) {
        try {
          await port.open({ baudRate: 9600 });
        } catch {
          toast.error("Connection failed", {
            description:
              "Failed to open port. Make sure no other application is using it.",
          });
          void reportSerialEvent({
            command: "connect",
            sent: false,
            response: null,
          });
          return false;
        }
      }

      portRef.current = port;
      writableRef.current = port.writable;

      const reader = port.readable!.getReader();
      readerRef.current = reader;
      decoderRef.current = new TextDecoder();

      setIsConnected(true);

      startReading(reader, () => {
        if (portRef.current === port) {
          console.warn("[Serial] Stream ended unexpectedly, disconnecting");
          disconnect();
        }
      });

      (async () => {
        // Consume the Arduino's boot message and check the protocol version,
        // so an app/firmware mismatch surfaces here instead of failing
        // silently on the first command.
        const bootLine = await waitForLine(5000);
        if (!portRef.current) return;
        if (bootLine) {
          try {
            const boot: unknown = JSON.parse(bootLine);
            if (isRecord(boot) && boot.proto !== EXPECTED_PROTO_VERSION) {
              toast.warning("Firmware version mismatch", {
                description: `Arduino reports protocol ${String(boot.proto)}; this app expects ${EXPECTED_PROTO_VERSION}. Flash the matching main.ino.`,
              });
            }
          } catch {
            // Non-JSON boot output — nothing to verify, continue
          }
        }
        if (preTestHookRef.current) {
          await preTestHookRef.current();
        }
        if (!portRef.current) return;
        toast.info("Testing device…");
        const ok = await sendTest();
        if (!portRef.current) return;
        if (ok) {
          toast.success("Device ready");
        } else {
          toast.error("Device test failed", {
            description: "Connected but got no response. Try reconnecting.",
          });
          void reportSerialEvent({
            command: "test",
            sent: true,
            response: null,
          });
        }
      })();

      return true;
    },
    [startReading, waitForLine, sendTest, disconnect],
  );

  const connect = useCallback(async () => {
    if (disconnectingRef.current) {
      await disconnectingRef.current;
    }
    if (portRef.current || wsRef.current) return;

    let port: SerialPort;
    try {
      port = await navigator.serial.requestPort();
    } catch {
      // User cancelled the port picker
      return;
    }

    await openPort(port);
  }, [openPort]);

  // Connect over Wi-Fi: the board (ESP32 with saved credentials) serves the
  // same id-correlated JSON protocol over a WebSocket on port 81. The firmware
  // mirrors the boot handshake on connect, so the post-connect flow below is
  // identical to the USB path.
  const connectWs = useCallback(
    async (url: string): Promise<boolean> => {
      if (disconnectingRef.current) {
        await disconnectingRef.current;
      }
      if (portRef.current || wsRef.current) return false;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        return false;
      }
      wsRef.current = ws;
      setIsConnected(true);
      setIsWs(true);

      ws.onmessage = (event) => {
        const text = typeof event.data === "string" ? event.data : "";
        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          console.log("[WiFi] ←", trimmed); // eslint-disable-line no-console -- hardware debug trace
          processLine(trimmed);
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) {
          console.warn("[WiFi] Connection closed");
          disconnect();
        }
      };

      const opened = await new Promise<boolean>((resolve) => {
        if (ws.readyState === WebSocket.OPEN) {
          resolve(true);
          return;
        }
        ws.onopen = () => resolve(true);
        ws.onerror = () => resolve(false);
      });
      if (!opened) {
        disconnect();
        return false;
      }

      // Same handshake as the USB path: consume the boot "ready" line, check
      // the protocol version, then run the mechanical test.
      (async () => {
        const bootLine = await waitForLine(5000);
        if (!portRef.current && !wsRef.current) return;
        if (bootLine) {
          try {
            const boot: unknown = JSON.parse(bootLine);
            if (isRecord(boot) && boot.proto !== EXPECTED_PROTO_VERSION) {
              toast.warning("Firmware version mismatch", {
                description: `Board reports protocol ${String(boot.proto)}; this app expects ${EXPECTED_PROTO_VERSION}. Flash the matching main.ino.`,
              });
            }
          } catch {
            // Non-JSON boot output — nothing to verify, continue
          }
        }
        if (preTestHookRef.current) {
          await preTestHookRef.current();
        }
        if (!portRef.current && !wsRef.current) return;
        toast.info("Testing device…");
        const ok = await sendTest();
        if (!portRef.current && !wsRef.current) return;
        if (ok) {
          toast.success("Device ready (Wi-Fi)");
        } else {
          toast.error("Device test failed", {
            description: "Connected but got no response. Check the board is powered and on the same network.",
          });
          void reportSerialEvent({
            command: "test",
            sent: true,
            response: null,
          });
        }
      })();

      return true;
    },
    [disconnect, processLine, waitForLine, sendTest],
  );

  // Detect physical USB unplug
  useEffect(() => {
    if (!navigator.serial) return;
    const handleDisconnect = (event: Event) => {
      if (portRef.current && portRef.current === (event.target as SerialPort)) {
        console.warn("[Serial] Device unplugged");
        disconnect();
      }
    };
    navigator.serial.addEventListener("disconnect", handleDisconnect);
    return () => {
      navigator.serial.removeEventListener("disconnect", handleDisconnect);
    };
  }, [disconnect]);

  useEffect(() => {
    const listener: SerialMessageListener = (msg) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        "status" in msg &&
        (msg as Record<string, unknown>).status === "test_complete"
      ) {
        setIsReady(true);
      }
    };
    const listeners = listenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const subscribe = useCallback((listener: SerialMessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const registerPreTestHook = useCallback((fn: () => Promise<void>) => {
    const previous = preTestHookRef.current;
    preTestHookRef.current = previous
      ? async () => {
          await previous();
          await fn();
        }
      : fn;
    // Return an unsubscribe so React StrictMode double-effects (and any
    // re-registration) can't chain the hook twice per connect.
    return () => {
      preTestHookRef.current = previous;
    };
  }, []);

  const sendCommandWithNewline = useCallback(
    (data: string) => sendCommand(data + "\n"),
    [sendCommand],
  );

  const binBusyRef = useRef(false);

  const sendBin = useCallback(
    async (binNumber: number): Promise<unknown | null> => {
      const ws = wsRef.current;
      const transportOpen = Boolean(portRef.current && writableRef.current) ||
        (ws !== null && ws.readyState === WebSocket.OPEN);
      if (!transportOpen) return null;

      // The firmware executes commands serially, so a second route request
      // arriving while one is in flight must wait rather than be dropped -
      // dropping it made callers treat a concurrent request as a routing
      // failure and disable auto-feed. Bounded wait; still fail if the
      // in-flight command never clears.
      const busyDeadline = Date.now() + 20000;
      while (binBusyRef.current) {
        if (Date.now() > busyDeadline) return null;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      binBusyRef.current = true;
      try {
        const id = nextCmdIdRef.current++;
        const sent = await sendCommand(
          JSON.stringify({ bin: binNumber, id }) + "\n",
        );
        if (!sent) return null;

        // Correlate on the echoed command id so asynchronous messages (jam
        // alerts, boot "ready") can never be mistaken for this command's
        // response.
        return await waitForId(id, 15000);
      } finally {
        binBusyRef.current = false;
      }
    },
    [sendCommand, waitForId],
  );

  const sendCommandWithResponse = useCallback(
    async (
      data: Record<string, unknown>,
      timeoutMs = 5000,
      retries = 0,
    ): Promise<unknown | null> => {
      const ws = wsRef.current;
      const transportOpen = Boolean(portRef.current && writableRef.current) ||
        (ws !== null && ws.readyState === WebSocket.OPEN);
      if (!transportOpen) return null;

      // Bounded retry with linear backoff for idempotent commands only (e.g.
      // clearDevice). Callers must NOT request retries for commands that have
      // side effects if executed twice (bin routing) — a lost ACK could mean
      // the command actually ran.
      let attempt = 0;
      while (true) {
        const id = nextCmdIdRef.current++;
        const sent = await sendCommand(JSON.stringify({ ...data, id }) + "\n");
        if (sent) {
          const response = await waitForId(id, timeoutMs);
          if (response !== null || attempt >= retries) return response;
        } else if (attempt >= retries) {
          return null;
        }
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    },
    [sendCommand, waitForId],
  );

  // Device heartbeat: pings the firmware every 10 s so a hung board (stuck
  // servo, watchdog timeout) is surfaced within seconds instead of waiting out
  // a 15 s bin timeout. Id-correlated, so asynchronous messages can't fake a
  // pong. Warns once per unresponsive stretch, clears on recovery.
  useEffect(() => {
    if (!isConnected || !isReady) return;
    let warned = false;
    let toastId: string | number | undefined;
    const interval = setInterval(() => {
      // The firmware executes commands serially: a route/feed blocks loop()
      // for its whole budget (up to 15 s), so a ping written mid-route would
      // only be answered after it finishes and would falsely time out. Skip
      // the ping while a bin command is in flight instead.
      if (binBusyRef.current) return;
      void sendCommandWithResponse({ ping: true }, 5000).then((pong) => {
        if (pong) {
          if (warned && toastId !== undefined) {
            toast.dismiss(toastId);
          }
          warned = false;
          return;
        }
        if (warned) return;
        warned = true;
        toastId = toast.warning("Device unresponsive", {
          description:
            "No response from the sorter. Check the USB connection and power.",
          duration: Infinity,
          dismissible: true,
        });
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [isConnected, isReady, sendCommandWithResponse]);

  const sendFeed = useCallback(
    () => sendCommandWithResponse({ feeder: true }, 10000),
    [sendCommandWithResponse],
  );

  return (
    <SerialContext
      value={{
        isConnected,
        isReady,
        isWs,
        connect,
        connectWs,
        disconnect,
        sendBin,
        sendTest,
        sendCommand: sendCommandWithNewline,
        sendCommandWithResponse,
        sendFeed,
        subscribe,
        registerPreTestHook,
      }}
    >
      {children}
    </SerialContext>
  );
}

export function useSerial() {
  const context = useContext(SerialContext);
  if (!context) {
    throw new Error("useSerial must be used within a SerialProvider");
  }
  return context;
}

/**
 * Subscribe to all parsed JSON messages from the Arduino.
 * The callback is stable across re-renders (uses a ref internally).
 */
export function useSerialMessage(listener: SerialMessageListener) {
  const { subscribe } = useSerial();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => {
    return subscribe((msg) => listenerRef.current(msg));
  }, [subscribe]);
}
