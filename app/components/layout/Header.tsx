import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  getConversionCategoryConfig,
  getDisplayConversionSummariesByCategory,
} from '~/lib/conversion-categories'
import type { ConversionCategory } from '~/lib/conversions'

const categoryOrder: ConversionCategory[] = ['image', 'developer', 'document', 'ebook']
const categoryLinks = categoryOrder
  .map((category) => {
    const config = getConversionCategoryConfig(category)

    return {
      ...config,
      conversions: getDisplayConversionSummariesByCategory(category).slice(0, category === 'ebook' ? 3 : 5),
    }
  })
  .filter((category) => category.conversions.length > 0 || category.hubHref)

export function Header() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className='sticky top-0 z-50 bg-background/92 backdrop-blur-md transition-shadow duration-200'
      data-scrolled={scrolled || undefined}
      style={{ boxShadow: scrolled ? '0 1px 3px 0 rgb(0 0 0 / 0.06)' : 'none' }}
    >
      <div className='mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8 lg:px-12'>
        <Link to='/' className='flex items-center gap-0'>
          <span className='font-heading text-xl font-semibold text-foreground'>WittyFlip</span>
          <span className='font-heading text-xl font-semibold text-primary'>.</span>
        </Link>

        <nav className='flex items-center gap-6'>
          <Link
            to='/image-converter'
            className='text-sm font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4'
          >
            Image tools
          </Link>

          <Link
            to='/blog'
            className='text-sm font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4'
          >
            Blog
          </Link>

          <Link
            to='/privacy'
            className='text-sm font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4'
          >
            Privacy
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='inline-flex items-center gap-1 text-sm font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground'>
                Browse tools
                <ChevronDown className='h-3.5 w-3.5' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-80 p-2'>
              {categoryLinks.map((category, index) => (
                <div key={category.category}>
                  {index > 0 && <DropdownMenuSeparator />}

                  <div className='px-2 py-2'>
                    <div className='flex items-center justify-between gap-3'>
                      <div>
                        <p className='text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground'>
                          {category.title}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>{category.description}</p>
                      </div>

                      {category.hubHref && (
                        <Link
                          to={category.hubHref}
                          className='text-xs font-medium text-primary hover:underline'>
                          See all
                        </Link>
                      )}
                    </div>
                  </div>

                  {category.conversions.map((conversion) => (
                    <DropdownMenuItem key={conversion.slug} asChild>
                      <Link
                        to='/$conversionType'
                        params={{ conversionType: conversion.slug }}
                        className='cursor-pointer'
                      >
                        <span className='text-sm text-muted-foreground'>
                          {conversion.sourceFormat.toUpperCase()} &rarr; {conversion.targetFormat.toUpperCase()}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  )
}
