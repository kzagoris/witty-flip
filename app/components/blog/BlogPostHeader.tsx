import { Link } from "@tanstack/react-router"
import { ArrowLeft, Clock } from "lucide-react"
import { Badge } from "~/components/ui/badge"

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
      <div className="mb-6 flex items-center justify-between">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Blog
        </Link>
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          {readingTimeMin} min read
        </Badge>
      </div>

      <time dateTime={date} className="text-sm text-muted-foreground">
        {formatDate(date)}
      </time>
      <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        {description}
      </p>
    </div>
  )
}
