import type { ConversionType } from '~/lib/conversions'

export function ConversionHero({ conversion }: { conversion: ConversionType }) {
  return (
    <section
      className="relative overflow-hidden rounded-2xl px-6 py-12 text-white sm:py-16"
      style={{
        background: `linear-gradient(135deg, ${conversion.formatColor}, ${conversion.formatColor}cc, ${conversion.formatColor}99)`,
      }}
    >
      <div className="relative z-10">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
          {conversion.seo.h1}
        </h1>
        <p className="mt-3 max-w-xl text-white/90">
          Free, fast, and private &mdash; no signup required
        </p>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15)_0%,_transparent_60%)]" />
    </section>
  )
}
