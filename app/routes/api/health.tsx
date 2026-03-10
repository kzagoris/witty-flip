import { createFileRoute } from "@tanstack/react-router"
import { resolveRequestId, withRequestIdHeader } from "~/lib/observability"

export function handleHealthRequest(request?: Request): Response {
    const requestId = resolveRequestId(request)
    return Response.json({ status: "ok" }, { status: 200, headers: withRequestIdHeader(requestId) })
}

export const Route = createFileRoute("/api/health")({
    server: {
        handlers: {
            GET: ({ request }) => handleHealthRequest(request),
        },
    },
})
