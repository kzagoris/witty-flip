import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { createCheckout } from '~/server/api/create-checkout'
import { callServerFn } from '~/lib/api-client'
import type { CheckoutResponse } from '~/server/api/contracts'

type PaymentPromptProps = {
  notice?: string
} & (
  | { fileId: string; attemptId?: never }
  | { attemptId: string; fileId?: never }
)

export function PaymentPrompt({ fileId, attemptId, notice }: PaymentPromptProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCheckout = async () => {
    setLoading(true)
    setError(null)

    const result = await callServerFn(createCheckout, fileId ? { fileId } : { attemptId })
    if (!result.ok) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    const data: CheckoutResponse = result.data
    window.location.href = data.checkoutUrl
  }

  return (
    <div className="animate-fade-in rounded-lg border-l-4 border-l-[var(--color-warning)] bg-secondary p-6">
      {notice && (
        <p className="mb-4 text-sm text-muted-foreground">{notice}</p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Free daily limit reached
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;ve used your 2 free conversions for today.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground">$0.49</p>
            <p className="text-xs text-muted-foreground">per file &middot; no subscription</p>
          </div>

          <Button
            onClick={() => void handleCheckout()}
            disabled={loading}
            size="lg"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Pay &amp; Convert
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
