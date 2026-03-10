import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Button } from '~/components/ui/button'
import { getConversionSummaries } from '~/lib/conversion-summaries'

const conversions = getConversionSummaries()

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-1.5">
          <span className="font-heading text-xl font-bold text-primary">WittyFlip</span>
        </Link>

        <nav className="flex items-center gap-1">
        <Link to="/blog">
          <Button variant="ghost" size="sm">
            Blog
          </Button>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1">
              All Conversions
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {conversions.map((c) => (
              <DropdownMenuItem key={c.slug} asChild>
                <Link to="/$conversionType" params={{ conversionType: c.slug }} className="cursor-pointer">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.formatColor }}
                  />
                  {c.sourceFormat.toUpperCase()} &rarr; {c.targetFormat.toUpperCase()}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        </nav>
      </div>
    </header>
  )
}
