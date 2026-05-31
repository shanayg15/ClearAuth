import { NextRequest } from "next/server";
import { corsHeaders, corsResponse } from "@/lib/cors";
import { listAuthRequests, subscribe } from "@/lib/store";

// Owner: Shanay. Server-Sent Events feed. Emits a "snapshot" of all requests on
// connect, then an "upsert" event every time the store changes, so dashboards
// animate the pipeline live.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return corsResponse(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Initial snapshot
      const requests = await listAuthRequests();
      send("snapshot", { requests });

      // Live updates
      const unsubscribe = subscribe((evt) => {
        try {
          send(evt.type, evt.request);
        } catch (err) {
          console.error("[stream] send error:", err);
        }
      });

      // Keep-alive comment so proxies don't drop an idle connection
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // controller already closed
        }
      }, 25000);

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
