import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$conversionType')({
  component: ConversionPage,
})

function ConversionPage() {
  const { conversionType } = Route.useParams()
  return (
    <div>
      <h1>Convert {conversionType}</h1>
    </div>
  )
}
