import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Button } from '~/components/ui/button'
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
  return (
    <header className='sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60'>
      <div className='mx-auto flex h-14 max-w-5xl items-center justify-between px-4'>
        <Link to='/' className='flex items-center gap-1.5'>
          <span className='font-heading text-xl font-bold text-primary'>WittyFlip</span>
        </Link>

        <nav className='flex items-center gap-1'>
          <Link to='/image-converter'>
            <Button variant='ghost' size='sm'>
              Image tools
            </Button>
          </Link>

          <Link to='/blog'>
            <Button variant='ghost' size='sm'>
              Blog
            </Button>
          </Link>

          <Link to='/privacy'>
            <Button variant='ghost' size='sm'>
              Privacy
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='sm' className='gap-1'>
                Browse tools
                <ChevronDown className='h-3.5 w-3.5' />
              </Button>
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
                        <span
                          className='inline-block h-2.5 w-2.5 rounded-full'
                          style={{ backgroundColor: conversion.formatColor }}
                        />
                        {conversion.sourceFormat.toUpperCase()} &rarr; {conversion.targetFormat.toUpperCase()}
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
