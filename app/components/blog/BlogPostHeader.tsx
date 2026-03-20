import { Link } from "@tanstack/react-router"

interface BlogPostHeaderProps {
  title: string
  description: string
  date: string
  readingTimeMin: number
}

function formatDate(dateString: string): string {
  return new Date(dateString + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function BlogPostHeader({ title, description, date, readingTimeMin }: BlogPostHeaderProps) {
  return (
    <div className="mb-8">
      <div className="mb-6">
        <Link to="/blog" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          Blog
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        {formatDate(date)} &middot; {readingTimeMin} min read
      </p>
      <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl" style={{ textWrap: 'balance' }}>
        {title}
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
