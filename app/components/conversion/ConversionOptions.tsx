import { Sparkles, SlidersHorizontal } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/components/ui/accordion'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import type { ClientConversionProcessingMode } from '~/lib/client-converters/types'

interface ConversionOptionsProps {
  processingMode: ClientConversionProcessingMode
  onProcessingModeChange: (mode: ClientConversionProcessingMode) => void
  quality: number
  onQualityChange: (quality: number) => void
  disabled?: boolean
  hasEnhancedMode?: boolean
  title?: string
}

export function ConversionOptions({
  processingMode,
  onProcessingModeChange,
  quality,
  onQualityChange,
  disabled,
  hasEnhancedMode,
  title = 'Conversion options',
}: ConversionOptionsProps) {
  const qualityPercent = Math.round(quality * 100)

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <Accordion type="single" collapsible>
        <AccordionItem value="options" className="border-b-0 px-4">
          <AccordionTrigger className="py-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs font-normal text-muted-foreground">
                  Choose Standard or Enhanced output before converting.
                </p>
              </div>
            </div>
          </AccordionTrigger>

          <AccordionContent className="space-y-5 px-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Processing mode</p>
                  <p className="text-xs text-muted-foreground">
                    Standard uses built-in browser codecs. Enhanced adds WebAssembly quality controls for WebP.
                  </p>
                </div>
                {hasEnhancedMode && (
                  <div className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    WebP enhanced
                  </div>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={processingMode === 'standard' ? 'default' : 'outline'}
                  className="justify-start"
                  disabled={disabled}
                  onClick={() => onProcessingModeChange('standard')}
                >
                  Standard
                </Button>
                <Button
                  type="button"
                  variant={processingMode === 'enhanced' ? 'default' : 'outline'}
                  className="justify-start"
                  disabled={disabled || !hasEnhancedMode}
                  onClick={() => onProcessingModeChange('enhanced')}
                >
                  Enhanced
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                <label htmlFor="conversion-quality">Output quality</label>
                <span className="text-muted-foreground">{qualityPercent}%</span>
              </div>

              <input
                id="conversion-quality"
                type="range"
                min="0.4"
                max="1"
                step="0.05"
                value={quality}
                disabled={disabled}
                aria-valuetext={`${qualityPercent}%`}
                onChange={(event) => onQualityChange(Number(event.target.value))}
                className={cn(
                  'h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              />

              <p className="text-xs text-muted-foreground">
                Higher quality keeps more detail but produces larger image files.
              </p>
            </div>


          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
