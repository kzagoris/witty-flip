import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div>
      <h1>WittyFlip</h1>
      <p>Free online document converter</p>
    </div>
  )
}
