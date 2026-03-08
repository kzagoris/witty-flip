export interface ConversionFAQ {
  question: string
  answer: string
}

export interface ConversionSEO {
  title: string
  description: string
  h1: string
  keywords: string[]
}

export interface ConversionType {
  slug: string
  sourceFormat: string
  targetFormat: string
  sourceExtensions: string[]
  sourceMimeTypes: string[]
  targetExtension: string
  targetMimeType: string
  toolName: string
  formatColor: string
  seo: ConversionSEO
  seoContent: string
  faq: ConversionFAQ[]
  relatedConversions: string[]
}

const CONVERSION_TYPES = [
  {
    slug: 'docx-to-markdown',
    sourceFormat: 'docx',
    targetFormat: 'markdown',
    sourceExtensions: ['.docx'],
    sourceMimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    targetExtension: '.md',
    targetMimeType: 'text/markdown',
    toolName: 'pandoc',
    formatColor: '#2563eb',
    seo: {
      title: 'Convert DOCX to Markdown Online Free | WittyFlip',
      description: 'Convert Word DOCX files to clean Markdown format online. Free, fast, and private — no signup required. Perfect for developers and technical writers.',
      h1: 'Convert DOCX to Markdown',
      keywords: ['docx to markdown', 'word to markdown', 'convert docx', 'docx markdown converter'],
    },
    seoContent: '<p>Converting Word documents to Markdown is essential for developers, technical writers, and anyone working with plain-text documentation systems. WittyFlip uses Pandoc — the universal document converter — to transform your DOCX files into clean, well-structured Markdown.</p><p>Markdown is the lingua franca of modern documentation. GitHub READMEs, static site generators like Jekyll and Hugo, and knowledge bases like Notion all speak Markdown natively. By converting your Word documents, you unlock compatibility with these tools while preserving headings, lists, links, bold, italic, and code blocks.</p><p>Our converter handles complex DOCX features including nested lists, tables, footnotes, and inline images. The output follows CommonMark standards for maximum compatibility. Upload your file, get your Markdown — no account needed, no data stored beyond the conversion window.</p><p>WittyFlip processes your files on our secure servers with automatic cleanup. Your documents are never shared, indexed, or used for training. Two free conversions per day, with additional conversions available for just $0.49 each.</p>',
    faq: [
      { question: 'Does the converter preserve formatting?', answer: 'Yes. Headings, bold, italic, links, lists, tables, and code blocks are all preserved in the Markdown output. Complex Word-specific formatting like tracked changes is simplified.' },
      { question: 'What Markdown flavor is used?', answer: 'The output follows CommonMark with GitHub Flavored Markdown (GFM) extensions for tables and task lists.' },
      { question: 'Is there a file size limit?', answer: 'Files up to 10MB are supported. Most Word documents are well under this limit.' },
      { question: 'Are my files kept after conversion?', answer: 'Converted files are available for download for 1 hour, then permanently deleted from our servers.' },
    ],
    relatedConversions: ['markdown-to-pdf', 'odt-to-docx', 'html-to-pdf'],
  },
  {
    slug: 'markdown-to-pdf',
    sourceFormat: 'markdown',
    targetFormat: 'pdf',
    sourceExtensions: ['.md', '.markdown'],
    sourceMimeTypes: ['text/markdown'],
    targetExtension: '.pdf',
    targetMimeType: 'application/pdf',
    toolName: 'pandoc',
    formatColor: '#9333ea',
    seo: {
      title: 'Convert Markdown to PDF Online Free | WittyFlip',
      description: 'Convert Markdown files to beautifully formatted PDF documents online. Free, instant, and private — no signup required.',
      h1: 'Convert Markdown to PDF',
      keywords: ['markdown to pdf', 'md to pdf', 'convert markdown', 'markdown pdf converter'],
    },
    seoContent: '<p>Turn your Markdown documents into professional PDFs with WittyFlip. Whether you are preparing a report, documentation, or a resume written in Markdown, our converter produces clean, typeset PDF output using Pandoc and LaTeX.</p><p>Markdown is perfect for writing, but sometimes you need a polished PDF for sharing with colleagues, clients, or for printing. Our converter handles standard Markdown syntax including headings, lists, code blocks with syntax highlighting, tables, links, and images.</p><p>The generated PDFs use professional typography with proper margins, page numbers, and a clean layout. Code blocks are rendered with monospace fonts and subtle background shading for readability.</p><p>Upload your .md or .markdown file and download a ready-to-share PDF in seconds. No software to install, no account to create. Two free conversions daily, with more available at $0.49 per file.</p>',
    faq: [
      { question: 'Does the PDF include syntax highlighting?', answer: 'Yes. Code blocks with language annotations are syntax-highlighted in the PDF output.' },
      { question: 'Can I convert README files?', answer: 'Absolutely. Any .md or .markdown file works, including GitHub README files.' },
      { question: 'What about images in my Markdown?', answer: 'Linked images referenced in the Markdown are not embedded. For best results, use self-contained Markdown without external image references.' },
    ],
    relatedConversions: ['docx-to-markdown', 'html-to-pdf', 'latex-to-pdf'],
  },
  {
    slug: 'html-to-pdf',
    sourceFormat: 'html',
    targetFormat: 'pdf',
    sourceExtensions: ['.html', '.htm'],
    sourceMimeTypes: ['text/html'],
    targetExtension: '.pdf',
    targetMimeType: 'application/pdf',
    toolName: 'weasyprint',
    formatColor: '#dc2626',
    seo: {
      title: 'Convert HTML to PDF Online Free | WittyFlip',
      description: 'Convert HTML files to PDF documents online. Preserves CSS styling, layout, and formatting. Free and private — no signup required.',
      h1: 'Convert HTML to PDF',
      keywords: ['html to pdf', 'convert html', 'html pdf converter', 'webpage to pdf'],
    },
    seoContent: '<p>Convert your HTML files to pixel-perfect PDFs with WittyFlip. Our converter uses WeasyPrint, a powerful HTML/CSS rendering engine, to produce PDFs that faithfully reproduce your document layout, fonts, colors, and CSS styling.</p><p>Unlike screenshot-based converters, WeasyPrint renders HTML as a proper paginated document with support for CSS print media queries, page breaks, headers, footers, and multi-column layouts. This means your converted PDFs look professional and print-ready.</p><p>Perfect for converting invoices, reports, documentation, or any HTML content into shareable PDF format. Inline CSS and embedded styles are fully supported. For the most predictable results, upload self-contained HTML and avoid relying on remote assets.</p><p>Upload your .html or .htm file and get a beautifully rendered PDF in seconds. Two free conversions per day, additional conversions just $0.49.</p>',
    faq: [
      { question: 'Does it support CSS styling?', answer: 'Yes. Inline CSS and embedded stylesheets are fully supported. For the most predictable output, keep styles inside the uploaded HTML file.' },
      { question: 'Can I convert a live webpage?', answer: 'Not directly. Save the webpage as an HTML file first, then upload it. For best results, use a self-contained HTML file with inline styles.' },
      { question: 'Are JavaScript-rendered pages supported?', answer: 'No. WeasyPrint renders static HTML/CSS only. JavaScript is not executed during conversion.' },
      { question: 'What kind of HTML works best?', answer: 'Self-contained HTML files work best. Inline your CSS and include the assets your document needs directly in the uploaded file whenever possible.' },
    ],
    relatedConversions: ['markdown-to-pdf', 'latex-to-pdf', 'docx-to-markdown'],
  },
  {
    slug: 'djvu-to-pdf',
    sourceFormat: 'djvu',
    targetFormat: 'pdf',
    sourceExtensions: ['.djvu'],
    sourceMimeTypes: ['image/vnd.djvu'],
    targetExtension: '.pdf',
    targetMimeType: 'application/pdf',
    toolName: 'djvulibre',
    formatColor: '#d97706',
    seo: {
      title: 'Convert DjVu to PDF Online Free | WittyFlip',
      description: 'Convert DjVu files to PDF format online. Fast, free, and private — no software installation needed. Perfect for scanned documents and ebooks.',
      h1: 'Convert DjVu to PDF',
      keywords: ['djvu to pdf', 'convert djvu', 'djvu converter', 'djvu pdf online'],
    },
    seoContent: '<p>DjVu is a specialized format for scanned documents and high-resolution images, but PDF is far more widely supported. WittyFlip converts your DjVu files to standard PDF format using djvulibre, the reference implementation of the DjVu format.</p><p>Many academic papers, historical documents, and scanned books are distributed in DjVu format. While DjVu offers excellent compression for scanned pages, most devices, e-readers, and document management systems expect PDF. Our converter bridges this gap instantly.</p><p>The conversion preserves the original page layout, resolution, and any embedded text layers (OCR). Both single-page and multi-page DjVu documents are supported. The resulting PDF maintains the visual fidelity of the original while being compatible with every PDF reader.</p><p>Simply upload your .djvu file and download the PDF. No registration, no software to install. Two free conversions per day, with unlimited conversions at $0.49 each.</p>',
    faq: [
      { question: 'Is the text searchable in the output PDF?', answer: 'If the original DjVu file contains an OCR text layer, it will be preserved in the PDF output, making the text searchable and selectable.' },
      { question: 'Are multi-page DjVu files supported?', answer: 'Yes. Both single-page (DJVU) and multi-page (DJVM) DjVu documents are fully supported.' },
      { question: 'Will the image quality be preserved?', answer: 'Yes. The conversion maintains the original resolution and visual quality of the scanned pages.' },
    ],
    relatedConversions: ['html-to-pdf', 'markdown-to-pdf', 'latex-to-pdf'],
  },
  {
    slug: 'epub-to-mobi',
    sourceFormat: 'epub',
    targetFormat: 'mobi',
    sourceExtensions: ['.epub'],
    sourceMimeTypes: ['application/epub+zip'],
    targetExtension: '.mobi',
    targetMimeType: 'application/x-mobipocket-ebook',
    toolName: 'calibre',
    formatColor: '#0d9488',
    seo: {
      title: 'Convert EPUB to MOBI Online Free | WittyFlip',
      description: 'Convert EPUB ebooks to MOBI format for Kindle devices. Free, fast, and private — no signup or software needed.',
      h1: 'Convert EPUB to MOBI',
      keywords: ['epub to mobi', 'convert epub', 'kindle converter', 'epub mobi converter'],
    },
    seoContent: '<p>Need to read an EPUB book on your Kindle? WittyFlip converts EPUB files to MOBI format using Calibre, the most trusted ebook management tool. The conversion preserves your book formatting, chapters, table of contents, and cover image.</p><p>EPUB is the open standard for ebooks, supported by most e-readers except Amazon Kindle, which historically uses the MOBI format. While newer Kindles support some EPUB variants, MOBI remains the most compatible format across all Kindle devices and the Kindle app.</p><p>Our converter handles complex ebook features including embedded fonts, images, chapter navigation, metadata, and CSS styling. The output MOBI file is optimized for Kindle rendering with proper page breaks and formatting.</p><p>Upload your EPUB file and get a Kindle-ready MOBI in seconds. Two free conversions daily, with additional conversions at $0.49. No account required — your files are automatically deleted after one hour.</p>',
    faq: [
      { question: 'Will my Kindle table of contents work?', answer: 'Yes. The chapter structure and table of contents from the EPUB are preserved in the MOBI output.' },
      { question: 'Are images and cover art preserved?', answer: 'Yes. Embedded images and the cover image are included in the MOBI file.' },
      { question: 'Can I send the MOBI directly to my Kindle?', answer: 'After downloading, you can email the MOBI file to your Kindle email address or transfer it via USB.' },
      { question: 'Does it support DRM-protected EPUBs?', answer: 'No. DRM-protected files cannot be converted. Only DRM-free EPUB files are supported.' },
    ],
    relatedConversions: ['docx-to-markdown', 'markdown-to-pdf', 'html-to-pdf'],
  },
  {
    slug: 'odt-to-docx',
    sourceFormat: 'odt',
    targetFormat: 'docx',
    sourceExtensions: ['.odt'],
    sourceMimeTypes: ['application/vnd.oasis.opendocument.text'],
    targetExtension: '.docx',
    targetMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    toolName: 'pandoc',
    formatColor: '#ea580c',
    seo: {
      title: 'Convert ODT to DOCX Online Free | WittyFlip',
      description: 'Convert LibreOffice ODT files to Microsoft Word DOCX format. Free, fast, and private — no account or software required.',
      h1: 'Convert ODT to DOCX',
      keywords: ['odt to docx', 'convert odt', 'libreoffice to word', 'odt docx converter'],
    },
    seoContent: '<p>Need to share a LibreOffice document with Microsoft Word users? WittyFlip converts ODT (OpenDocument Text) files to DOCX format using Pandoc, ensuring broad compatibility with Microsoft Office and other word processors.</p><p>ODT is the default format for LibreOffice Writer and other open-source office suites. While it is an open standard, many workplaces and collaborators expect Microsoft Word DOCX files. Our converter bridges this gap while preserving your document structure.</p><p>The conversion handles headings, paragraphs, lists, tables, bold, italic, links, and basic formatting. Complex ODT features like tracked changes and advanced styles may be simplified in the output, but the core document content and structure are faithfully preserved.</p><p>Upload your .odt file and download a .docx in seconds. Free for two conversions per day, then $0.49 per file. No registration needed.</p>',
    faq: [
      { question: 'Are tables and lists preserved?', answer: 'Yes. Tables, bulleted lists, numbered lists, and nested lists are preserved in the DOCX output.' },
      { question: 'What about images in my ODT?', answer: 'Embedded images are included in the converted DOCX file.' },
      { question: 'Can I convert back from DOCX to ODT?', answer: 'Not currently. WittyFlip supports ODT to DOCX conversion only at this time.' },
    ],
    relatedConversions: ['docx-to-markdown', 'html-to-pdf', 'markdown-to-pdf'],
  },
  {
    slug: 'latex-to-pdf',
    sourceFormat: 'latex',
    targetFormat: 'pdf',
    sourceExtensions: ['.tex'],
    sourceMimeTypes: ['application/x-tex'],
    targetExtension: '.pdf',
    targetMimeType: 'application/pdf',
    toolName: 'pdflatex',
    formatColor: '#16a34a',
    seo: {
      title: 'Convert LaTeX to PDF Online Free | WittyFlip',
      description: 'Compile LaTeX .tex files to PDF online. No TeX distribution needed. Free, fast, and private — no signup required.',
      h1: 'Convert LaTeX to PDF',
      keywords: ['latex to pdf', 'compile latex', 'tex to pdf', 'latex compiler online'],
    },
    seoContent: '<p>Compile your LaTeX documents to PDF without installing a full TeX distribution. WittyFlip runs pdflatex on our servers to produce professional-quality PDFs from your .tex files instantly.</p><p>LaTeX is the gold standard for academic papers, theses, and scientific documents. It produces beautifully typeset output with proper mathematical notation, bibliographies, and cross-references. However, installing and configuring a TeX distribution locally can be cumbersome — our online compiler eliminates that friction.</p><p>Our server includes a comprehensive TeX Live installation with common packages for mathematics, science, and general document preparation. Upload your .tex file and get a compiled PDF in seconds. Note that multi-file projects (with separate .bib, .sty, or included .tex files) are not supported — your document must be self-contained in a single .tex file.</p><p>Two free compilations per day, with additional compilations at $0.49. Your files are processed securely and deleted automatically after one hour.</p>',
    faq: [
      { question: 'Which LaTeX packages are supported?', answer: 'Our server includes TeX Live with common packages for math, science, and general documents. Exotic or custom packages may not be available.' },
      { question: 'Can I compile multi-file LaTeX projects?', answer: 'Not currently. Your document must be self-contained in a single .tex file. External includes, bibliography files, and custom style files are not supported.' },
      { question: 'Does it support BibTeX?', answer: 'Not at this time. Bibliography entries must be included inline using the thebibliography environment.' },
      { question: 'How many times is pdflatex run?', answer: 'The compiler runs pdflatex once. For documents with cross-references or table of contents, some references may show as undefined.' },
    ],
    relatedConversions: ['markdown-to-pdf', 'html-to-pdf', 'docx-to-markdown'],
  },
] as const satisfies readonly ConversionType[]

const slugIndex = new Map<string, ConversionType>(CONVERSION_TYPES.map(c => [c.slug, c]))

export function getConversionBySlug(slug: string): ConversionType | undefined {
  return slugIndex.get(slug)
}

export function isValidConversionType(slug: string): boolean {
  return slugIndex.has(slug)
}

export function getAllConversionTypes(): ConversionType[] {
  return [...CONVERSION_TYPES]
}
