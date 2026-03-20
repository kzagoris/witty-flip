// The html prop contains developer-authored content from conversions.ts (hardcoded in the
// codebase). It is NOT user-supplied input, so dangerouslySetInnerHTML is safe here.
export function SEOContent({ html }: { html: string }) {
  return (
    <section className="mt-16 sm:mt-20">
      <hr className="mb-10 border-border" />
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  )
}
