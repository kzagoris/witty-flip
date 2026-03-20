import { useCallback, useRef, useState } from 'react'
import { Upload, FileIcon } from 'lucide-react'
import { cn } from '~/lib/utils'

interface FileUploaderProps {
  sourceExtensions: string[]
  sourceMimeTypes: string[]
  maxSizeMB: number
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export function FileUploader({
  sourceExtensions,
  sourceMimeTypes,
  maxSizeMB,
  onFileSelected,
  disabled,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptString = [
    ...sourceExtensions,
    ...sourceMimeTypes,
  ].join(',')

  const handleFile = useCallback(
    (file: File) => {
      setSizeError(null)
      const maxBytes = maxSizeMB * 1024 * 1024
      if (file.size > maxBytes) {
        setSizeError(`File is too large. Maximum size is ${maxSizeMB}MB.`)
        return
      }
      onFileSelected(file)
    },
    [maxSizeMB, onFileSelected],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [disabled, handleFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ''
    },
    [handleFile],
  )

  return (
    <div className="animate-fade-in">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'relative flex cursor-pointer items-center gap-4 rounded-lg border border-dashed px-6 py-8 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-secondary/50',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <div
          className={cn(
            'rounded-lg p-3 transition-colors',
            isDragging ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground',
          )}
        >
          {isDragging ? (
            <FileIcon className="h-6 w-6" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-foreground">
            {isDragging ? 'Drop your file here' : 'Drag & drop your file here'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            or click to browse &middot; Max {maxSizeMB}MB &middot;{' '}
            {sourceExtensions.map((e) => e.toUpperCase()).join(', ')}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={acceptString}
          onChange={handleChange}
          className="hidden"
          disabled={disabled}
        />
      </div>
      {sizeError && (
        <p className="mt-2 text-sm text-destructive">{sizeError}</p>
      )}
    </div>
  )
}
