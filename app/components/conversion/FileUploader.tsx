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
      // Reset input so same file can be re-selected
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
          'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-all',
          isDragging
            ? 'scale-[1.02] border-primary bg-primary/5'
            : 'border-neutral-300 hover:border-primary/50 hover:bg-neutral-50',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <div
          className={cn(
            'mb-3 rounded-full p-3 transition-colors',
            isDragging ? 'bg-primary/10 text-primary' : 'bg-neutral-100 text-neutral-500 motion-safe:animate-pulse-border',
          )}
        >
          {isDragging ? (
            <FileIcon className="h-8 w-8 motion-safe:animate-slide-in-right" />
          ) : (
            <Upload className="h-8 w-8" />
          )}
        </div>
        <p className="text-sm font-medium text-neutral-700">
          {isDragging ? 'Drop your file here' : 'Drag & drop your file here'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          or click to browse &middot; Max {maxSizeMB}MB &middot;{' '}
          {sourceExtensions.map((e) => e.toUpperCase()).join(', ')}
        </p>
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
