import { Link } from '@tanstack/react-router'

export function Footer() {
  return (
    <footer className="mt-auto bg-secondary py-12 sm:py-16">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:grid-cols-3 sm:px-8 lg:px-12">
        <div>
          <p className="font-heading text-lg font-semibold text-foreground">WittyFlip<span className="text-primary">.</span></p>
          <p className="mt-2 text-sm text-muted-foreground">
            Privacy-first file conversion. No signup needed.
          </p>
        </div>

        <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">Home</Link>
          <Link to="/image-converter" className="transition-colors hover:text-foreground">Image tools</Link>
          <Link to="/blog" className="transition-colors hover:text-foreground">Blog</Link>
          <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
        </nav>

        <div className="text-sm text-muted-foreground">
          <p>Files auto-deleted after 1 hour.</p>
          <p className="mt-1">2 free conversions per day.</p>
          <p className="mt-4">&copy; {new Date().getFullYear()} WittyFlip. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
