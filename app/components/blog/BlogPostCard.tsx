import { Link } from "@tanstack/react-router"
import type { BlogPostSummary } from "~/lib/blog"

function formatDate(dateString: string): string {
  return new Date(dateString + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function BlogPostCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      className="group flex items-start gap-6 border-b py-5 transition-colors"
    >
      <time dateTime={post.date} className="shrink-0 text-sm text-muted-foreground w-24">
        {formatDate(post.date)}
      </time>
      <div>
        <h2 className="font-heading text-base font-medium text-foreground transition-colors group-hover:text-primary">
          {post.title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
          {post.description}
        </p>
      </div>
    </Link>
  )
}
