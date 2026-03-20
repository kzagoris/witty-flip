import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '~/components/ui/button'

export function HeroSection() {
  return (
    <section className='py-16 sm:py-24 lg:py-32'>
      <div className='max-w-[60%]'>
        <p className='text-xs font-medium uppercase tracking-[0.3em] text-primary'>
          Privacy-first file conversion
        </p>

        <h1 className='mt-6 font-heading text-4xl font-semibold tracking-[-0.03em] sm:text-5xl lg:text-6xl'>
          Convert Files Without the Guesswork
        </h1>

        <p className='mt-6 max-w-2xl text-lg leading-8 text-muted-foreground'>
          Image, document, and ebook tools with clear processing rules. Many conversions run in your browser, while server-side jobs stay temporary and auto-delete after the retention window.
        </p>

        <div className='mt-8 flex items-center gap-4'>
          <Button asChild size='lg'>
            <Link to='/image-converter'>
              Explore image tools
              <ArrowRight className='h-4 w-4' />
            </Link>
          </Button>

          <Link
            to='/privacy'
            className='inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground'
          >
            See privacy details
            <ArrowRight className='h-3.5 w-3.5' />
          </Link>
        </div>

        <p className='mt-6 text-sm text-muted-foreground'>
          No signup needed &middot; 2 free conversions per day &middot; Pay per file instead of getting pushed into a subscription
        </p>
      </div>
    </section>
  )
}
