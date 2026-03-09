export function Footer() {
  return (
    <footer className="mt-auto border-t bg-neutral-50 py-8">
      <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} WittyFlip. All rights reserved.</p>
        <p className="mt-1">
          Your files are processed securely and automatically deleted after 1 hour.
        </p>
      </div>
    </footer>
  )
}
