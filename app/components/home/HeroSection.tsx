export function HeroSection() {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-purple-600 to-purple-800 px-6 py-16 text-center text-white sm:py-20">
      <div className="relative z-10">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
          WittyFlip
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-purple-100">
          Free online document converter. DOCX to Markdown, DjVu to PDF, EPUB to MOBI, and more.
        </p>
        <p className="mt-2 text-sm text-purple-200">
          No signup needed &middot; 2 free conversions per day &middot; Files deleted after 1 hour
        </p>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.1)_0%,_transparent_60%)]" />
    </section>
  )
}
