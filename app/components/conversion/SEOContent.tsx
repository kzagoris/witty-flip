import { Shield } from 'lucide-react'

// The html prop contains developer-authored content from conversions.ts (hardcoded in the
// codebase). It is NOT user-supplied input, so dangerouslySetInnerHTML is safe here.
export function SEOContent({ html }: { html: string }) {
  return (
    <section className="mt-10">
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Shield className="h-4 w-4" />
        <span>Files are automatically deleted 1 hour after conversion.</span>
      </div>
    </section>
  )
}
