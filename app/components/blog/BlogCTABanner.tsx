import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

interface BlogCTABannerProps {
  conversionSlug: string
  conversionName: string
  formatColor: string
}

export function BlogCTABanner({ conversionSlug, conversionName, formatColor }: BlogCTABannerProps) {
  return (
    <div
      className="mb-8 rounded-lg border-l-4 p-4"
      style={{
        borderLeftColor: formatColor,
        backgroundColor: `${formatColor}08`,
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium">
          Try our {conversionName} converter — free and instant
        </p>
        <Link
          to="/$conversionType"
          params={{ conversionType: conversionSlug }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: formatColor }}
        >
          Convert Now
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
