import { subscribeLive } from "@/lib/live/hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCTS = new Set(["BTC-USD", "ETH-USD"]);

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const product = url.searchParams.get("product") ?? "BTC-USD";
  if (!PRODUCTS.has(product)) {
    return new Response(JSON.stringify({ error: "Unsupported product" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (frame: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
        } catch {
          unsubscribe?.();
        }
      };
      unsubscribe = subscribeLive(product, send);
      request.signal.addEventListener("abort", () => {
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
