import { Link } from '@tanstack/react-router'
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '~/components/ui/button'

export function HeroSection() {
  return (
    <section className='relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-indigo-600 to-purple-800 px-6 py-16 text-white shadow-lg sm:px-10 sm:py-20'>
      <div className='relative z-10 max-w-3xl'>
        <div className='inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm font-medium text-white/90 backdrop-blur'>
          <Sparkles className='h-4 w-4' />
          Privacy-first file conversion
        </div>

        <h1 className='mt-6 font-heading text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl'>
          Convert Files Without the Guesswork
        </h1>

        <p className='mt-4 max-w-2xl text-lg leading-8 text-indigo-50'>
          Image, document, and ebook tools with clear processing rules. Many conversions run in your browser, while server-side jobs stay temporary and auto-delete after the retention window.
        </p>

        <div className='mt-8 flex flex-wrap gap-3'>
          <Button asChild size='lg' variant='secondary'>
            <Link to='/image-converter'>
              Explore image tools
              <ArrowRight className='h-4 w-4' />
            </Link>
          </Button>

          <Button asChild size='lg' variant='outline' className='border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white'>
            <Link to='/privacy'>
              <ShieldCheck className='h-4 w-4' />
              See privacy details
            </Link>
          </Button>
        </div>

        <p className='mt-4 text-sm text-indigo-100/90'>
          No signup needed &middot; 2 free conversions per day &middot; Pay per file instead of getting pushed into a subscription
        </p>
      </div>

      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.14)_0%,_transparent_60%)]' />
    </section>
  )
}
