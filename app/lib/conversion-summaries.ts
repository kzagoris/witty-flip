export interface ConversionSummary {
  slug: string
  sourceFormat: string
  targetFormat: string
  formatColor: string
  description: string
  heading: string
}

const CONVERSION_SUMMARIES = [
  {
    slug: 'docx-to-markdown',
    sourceFormat: 'docx',
    targetFormat: 'markdown',
    formatColor: '#2563eb',
    description:
      'Convert Word DOCX files to clean Markdown format online. Free, fast, and private - no signup required. Perfect for developers and technical writers.',
    heading: 'Convert DOCX to Markdown',
  },
  {
    slug: 'markdown-to-pdf',
    sourceFormat: 'markdown',
    targetFormat: 'pdf',
    formatColor: '#9333ea',
    description:
      'Convert Markdown files to beautifully formatted PDF documents online. Free, instant, and private - no signup required.',
    heading: 'Convert Markdown to PDF',
  },
  {
    slug: 'html-to-pdf',
    sourceFormat: 'html',
    targetFormat: 'pdf',
    formatColor: '#dc2626',
    description:
      'Convert HTML files to PDF documents online. Preserves CSS styling, layout, and formatting. Free and private - no signup required.',
    heading: 'Convert HTML to PDF',
  },
  {
    slug: 'djvu-to-pdf',
    sourceFormat: 'djvu',
    targetFormat: 'pdf',
    formatColor: '#d97706',
    description:
      'Convert DjVu files to PDF format online. Fast, free, and private - no software installation needed. Perfect for scanned documents and ebooks.',
    heading: 'Convert DjVu to PDF',
  },
  {
    slug: 'epub-to-mobi',
    sourceFormat: 'epub',
    targetFormat: 'mobi',
    formatColor: '#0d9488',
    description:
      'Convert EPUB ebooks to MOBI format for Kindle devices. Free, fast, and private - no signup or software needed.',
    heading: 'Convert EPUB to MOBI',
  },
  {
    slug: 'odt-to-docx',
    sourceFormat: 'odt',
    targetFormat: 'docx',
    formatColor: '#ea580c',
    description:
      'Convert LibreOffice ODT files to Microsoft Word DOCX format. Free, fast, and private - no account or software required.',
    heading: 'Convert ODT to DOCX',
  },
  {
    slug: 'latex-to-pdf',
    sourceFormat: 'latex',
    targetFormat: 'pdf',
    formatColor: '#16a34a',
    description:
      'Compile LaTeX .tex files to PDF online. No TeX distribution needed. Free, fast, and private - no signup required.',
    heading: 'Convert LaTeX to PDF',
  },
] as const satisfies readonly ConversionSummary[]

const summaryIndex = new Map<string, ConversionSummary>(
  CONVERSION_SUMMARIES.map((conversion) => [conversion.slug, conversion]),
)

export function getConversionSummaryBySlug(slug: string): ConversionSummary | undefined {
  return summaryIndex.get(slug)
}

export function getConversionSummaries(): ConversionSummary[] {
  return [...CONVERSION_SUMMARIES]
}
