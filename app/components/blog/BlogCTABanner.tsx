import { Link } from "@tanstack/react-router"

interface BlogCTABannerProps {
  conversionSlug: string
  conversionName: string
  formatColor: string
}

export function BlogCTABanner({ conversionSlug, conversionName }: BlogCTABannerProps) {
  return (
    <aside className="mb-8 border-l-2 border-primary pl-4 py-2">
      <p className="text-sm text-muted-foreground">
        Try our{' '}
        <Link
          to="/$conversionType"
          params={{ conversionType: conversionSlug }}
          className="font-medium text-primary hover:underline"
        >
          {conversionName} converter
        </Link>
        {' '}&mdash; free and instant
      </p>
    </aside>
  )
}
