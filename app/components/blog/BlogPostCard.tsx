import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "~/components/ui/card"
import { getConversionSummaryBySlug } from "~/lib/conversion-summaries"
import type { BlogPostSummary } from "~/lib/blog"

function formatDate(dateString: string): string {
  return new Date(dateString + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function BlogPostCard({ post }: { post: BlogPostSummary }) {
  const conversion = getConversionSummaryBySlug(post.relatedConversion)

  return (
    <Link to="/blog/$slug" params={{ slug: post.slug }}>
      <Card
        className="group h-full cursor-pointer transition-all duration-200 hover:shadow-lg motion-safe:hover:scale-[1.02] border-l-4 border-l-transparent hover:border-l-[var(--card-accent)]"
        style={{ "--card-accent": conversion?.formatColor ?? "#6366f1" } as React.CSSProperties}
      >
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <time dateTime={post.date} className="text-xs text-muted-foreground">
              {formatDate(post.date)}
            </time>
            {conversion && (
              <>
                <span className="text-muted-foreground">&middot;</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: conversion.formatColor }}
                  />
                  {conversion.sourceFormat.toUpperCase()} &rarr; {conversion.targetFormat.toUpperCase()}
                </span>
              </>
            )}
          </div>
          <CardTitle className="font-heading text-lg">
            {post.title}
          </CardTitle>
          <CardDescription className="line-clamp-2">
            {post.description}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Read more
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}
