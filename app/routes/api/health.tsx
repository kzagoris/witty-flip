import { createFileRoute } from "@tanstack/react-router"

export function handleHealthRequest(): Response {
    return Response.json({ status: "ok" }, { status: 200 })
}

export const Route = createFileRoute("/api/health")({
    server: {
        handlers: {
            GET: () => handleHealthRequest(),
        },
    },
})
