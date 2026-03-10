import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

interface BlogBottomCTAProps {
  conversionSlug: string
  conversionName: string
  formatColor: string
}

export function BlogBottomCTA({ conversionSlug, conversionName, formatColor }: BlogBottomCTAProps) {
  return (
    <div
      className="mt-12 rounded-xl p-8 text-center text-white"
      style={{
        background: `linear-gradient(135deg, ${formatColor}, ${formatColor}cc)`,
      }}
    >
      <h2 className="font-heading text-2xl font-bold">Convert Your Files Now</h2>
      <p className="mx-auto mt-2 max-w-md text-white/90">
        Use our free {conversionName} converter. No signup required — just upload and download.
      </p>
      <Link
        to="/$conversionType"
        params={{ conversionType: conversionSlug }}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-6 py-2.5 font-medium transition-opacity hover:opacity-90"
        style={{ color: formatColor }}
      >
        Try it now
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
