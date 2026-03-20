import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { Button } from "~/components/ui/button"

interface BlogBottomCTAProps {
  conversionSlug: string
  conversionName: string
  formatColor: string
}

export function BlogBottomCTA({ conversionSlug, conversionName }: BlogBottomCTAProps) {
  return (
    <div className="mt-12 rounded-xl bg-secondary p-8">
      <h2 className="font-heading text-2xl font-semibold">Ready to convert?</h2>
      <p className="mt-2 max-w-md text-muted-foreground">
        Use our free {conversionName} converter. No signup required — just upload and download.
      </p>
      <Button asChild className="mt-4">
        <Link to="/$conversionType" params={{ conversionType: conversionSlug }}>
          Try it now
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  )
}
