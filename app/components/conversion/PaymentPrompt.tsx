import { useState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'
import { Card, CardContent } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { createCheckout } from '~/server/api/create-checkout'
import { callServerFn } from '~/lib/api-client'
import type { CheckoutResponse } from '~/server/api/contracts'

interface PaymentPromptProps {
  fileId: string
  notice?: string
}

export function PaymentPrompt({ fileId, notice }: PaymentPromptProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCheckout = async () => {
    setLoading(true)
    setError(null)

    const result = await callServerFn(createCheckout, { fileId })
    if (!result.ok) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    const data: CheckoutResponse = result.data
    window.location.href = data.checkoutUrl
  }

  return (
    <Card className="animate-fade-in border-amber-200 bg-amber-50">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        {notice && (
          <div className="w-full rounded-lg border border-amber-300 bg-white/70 px-4 py-3 text-sm text-amber-800">
            {notice}
          </div>
        )}

        <div className="rounded-full bg-amber-100 p-3 text-amber-600">
          <CreditCard className="h-8 w-8" />
        </div>

        <div>
          <h3 className="font-heading text-lg font-bold text-amber-800">
            Free Daily Limit Reached
          </h3>
          <p className="mt-1 text-sm text-amber-700">
            You&apos;ve used your 2 free conversions for today.
          </p>
          <p className="mt-2 text-2xl font-bold text-amber-900">$0.49</p>
          <p className="text-xs text-amber-600">per file &middot; no subscription</p>
        </div>

        <Button
          onClick={() => void handleCheckout()}
          disabled={loading}
          size="lg"
          className="bg-amber-600 hover:bg-amber-700 hover:shadow-md motion-safe:hover:-translate-y-px"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="h-4 w-4" />
          )}
          Pay &amp; Convert
        </Button>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
