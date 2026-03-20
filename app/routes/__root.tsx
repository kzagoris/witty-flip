/// <reference types="vite/client" />
import type { ReactNode } from "react"
import { Link, Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router"
import { Header } from "~/components/layout/Header"
import { Footer } from "~/components/layout/Footer"
import { PageShell } from "~/components/layout/PageShell"
import appCss from "~/styles/globals.css?url"

export const Route = createRootRoute({
    head: () => ({
        meta: [
            { charSet: "utf-8" },
            { name: "viewport", content: "width=device-width, initial-scale=1" },
            { title: "WittyFlip - Free Online File Converter" },
            {
                name: "description",
                content:
                    "Convert documents online for free. DOCX to Markdown, DJVU to PDF, EPUB to MOBI, and more. No signup needed.",
            },
        ],
        links: [
            { rel: "icon", href: "/favicon.ico" },
            { rel: "preconnect", href: "https://fonts.googleapis.com" },
            { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
            {
                rel: "stylesheet",
                href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap",
            },
            { rel: "stylesheet", href: appCss },
        ],
    }),
    notFoundComponent: RootNotFound,
    component: RootComponent,
})

function RootComponent() {
    return (
        <RootDocument>
            <Header />
            <Outlet />
            <Footer />
        </RootDocument>
    )
}

function RootNotFound() {
    return (
        <RootDocument>
            <Header />
            <PageShell>
                <section className="flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
                    <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">404</p>
                    <h1 className="mt-4 font-heading text-4xl font-semibold text-foreground">Page not found</h1>
                    <p className="mt-3 max-w-xl text-muted-foreground">
                        The page you requested does not exist or may have moved.
                    </p>
                    <Link
                        to="/"
                        className="mt-8 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                        Back to home
                    </Link>
                </section>
            </PageShell>
            <Footer />
        </RootDocument>
    )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body className="min-h-screen flex flex-col bg-background text-foreground antialiased">
                {children}
                <Scripts />
            </body>
        </html>
    )
}
