import { describe, expect, it } from 'vitest'
import { sanitizeToolError } from '~/lib/converters/sanitize-error'

describe('sanitizeToolError', () => {
  it('redacts Windows absolute paths while preserving the filename', () => {
    const sanitized = sanitizeToolError('Pandoc failed to read C:\\Users\\alice\\Secrets\\draft.docx')

    expect(sanitized).toContain('draft.docx')
    expect(sanitized).not.toContain('C:\\Users\\alice\\Secrets')
  })

  it('redacts UNC paths while preserving the filename', () => {
    const sanitized = sanitizeToolError('Pandoc failed to read \\\\server\\share\\private\\draft.docx')

    expect(sanitized).toContain('draft.docx')
    expect(sanitized).not.toContain('\\\\server\\share\\private')
  })
})
