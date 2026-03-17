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

export type ConversionCategory = 'document' | 'ebook' | 'image' | 'developer'

export type ConversionProcessingMode = 'server' | 'client'

interface BaseConversionType {
  slug: string
  category: ConversionCategory
  processingMode: ConversionProcessingMode
  sourceFormat: string
  targetFormat: string
  sourceExtensions: string[]
  sourceMimeTypes: string[]
  targetExtension: string
  targetMimeType: string
  formatColor: string
  seo: ConversionSEO
  seoContent: string
  faq: ConversionFAQ[]
  relatedConversions: string[]
  estimatedSearchVolume?: number
  indexable?: boolean
  launchPhase?: number
  maxFileSizeMB?: number
  supportsPasteInput?: boolean
}

export interface ServerConversionType extends BaseConversionType {
  processingMode: 'server'
  toolName: string
  clientConverter?: never
  clientConverterEnhanced?: never
}

export interface ClientConversionType extends BaseConversionType {
  processingMode: 'client'
  clientConverter: string
  clientConverterEnhanced?: string
  toolName?: never
}

export type ConversionType = ServerConversionType | ClientConversionType

function createClientImageSeoContent(...paragraphs: string[]): string {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('')
}

const CLIENT_SIDE_IMAGE_PRIVACY_ANSWER =
  'These image conversions run locally in your browser, so your file is not uploaded to WittyFlip just to create the output.'

const CLIENT_SIDE_IMAGE_METADATA_ANSWER =
  'Standard browser-based image conversion usually strips EXIF metadata and may not preserve ICC color profiles. The pixels are converted correctly, but embedded metadata should not be expected in the download.'

const WEBP_FIRST_FRAME_ANSWER =
  'If you upload an animated WebP image, the converter exports the first frame as a static image.'

const WEBP_ENHANCED_ANSWER =
  'Standard mode uses the browser\'s built-in WebP codec for speed. Enhanced quality loads a WebP WASM codec on demand and is better for tricky transparency edges, gradients, or fidelity-sensitive exports.'

const JPG_TRANSPARENCY_ANSWER =
  'JPG does not support transparency, so transparent pixels are flattened against a solid background during conversion.'

const AVIF_BROWSER_SUPPORT_ANSWER =
  'AVIF decoding depends on your browser. Current Chrome, Edge, Firefox, and Safari releases generally work, but older browsers may show an unsupported message until you update.'

const SVG_EXTERNAL_ASSETS_ANSWER =
  'Self-contained SVG files work best. If the SVG references external fonts, stylesheets, or linked images, those resources may not appear in the PNG unless they are embedded in the SVG file itself.'

const CONVERSION_TYPES: readonly ConversionType[] = [
  {
    slug: 'docx-to-markdown',
    category: 'document',
    processingMode: 'server',
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
    category: 'document',
    processingMode: 'server',
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
    category: 'document',
    processingMode: 'server',
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
    category: 'document',
    processingMode: 'server',
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
    category: 'ebook',
    processingMode: 'server',
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
    category: 'document',
    processingMode: 'server',
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
    category: 'document',
    processingMode: 'server',
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
  {
    slug: 'webp-to-png',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'webp',
    targetFormat: 'png',
    sourceExtensions: ['.webp'],
    sourceMimeTypes: ['image/webp'],
    targetExtension: '.png',
    targetMimeType: 'image/png',
    formatColor: '#0ea5e9',
    seo: {
      title: 'Convert WebP to PNG Online Free | WittyFlip',
      description: 'Convert WebP images to PNG in your browser. Keep transparency, download a standard PNG, and keep the file local to your device.',
      h1: 'Convert WebP to PNG',
      keywords: ['webp to png', 'convert webp to png', 'webp png converter', 'save webp as png', 'webp to transparent png'],
    },
    seoContent: createClientImageSeoContent(
      'WebP files are excellent for web delivery, but PNG is still easier to edit, archive, and reopen in older desktop apps. WittyFlip converts WebP to PNG directly in your browser so you can get a standard image format without uploading the file first.',
      'This conversion is a strong fit when you need lossless editing, transparent backgrounds, or broader compatibility with design software, CMS uploads, and chat tools that still prefer PNG. Standard mode uses the browser\'s native codec, and Enhanced quality can load a WebP WASM path when you want more predictable fidelity.',
      'Transparent WebP images stay transparent in PNG output. If the source WebP is animated, the exported PNG uses the first frame only, and browser-based conversions usually do not carry EXIF or ICC metadata into the download.',
    ),
    faq: [
      { question: 'Does WebP to PNG keep transparency?', answer: 'Yes. PNG supports full alpha transparency, so transparent backgrounds are preserved when the source WebP includes them.' },
      { question: 'Can I convert animated WebP files?', answer: WEBP_FIRST_FRAME_ANSWER },
      { question: 'Is WebP to PNG private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
      { question: 'Will metadata or color profiles be preserved?', answer: CLIENT_SIDE_IMAGE_METADATA_ANSWER },
      { question: 'When should I use Enhanced quality?', answer: WEBP_ENHANCED_ANSWER },
    ],
    relatedConversions: ['webp-to-jpg', 'png-to-webp', 'jpg-to-png'],
    clientConverter: 'canvas',
    clientConverterEnhanced: 'webp-wasm',
    estimatedSearchVolume: 1830000,
    launchPhase: 9,
    indexable: false,
  },
  {
    slug: 'webp-to-jpg',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'webp',
    targetFormat: 'jpg',
    sourceExtensions: ['.webp'],
    sourceMimeTypes: ['image/webp'],
    targetExtension: '.jpg',
    targetMimeType: 'image/jpeg',
    formatColor: '#f59e0b',
    seo: {
      title: 'Convert WebP to JPG Online Free | WittyFlip',
      description: 'Convert WebP images to JPG in your browser for easy sharing, uploads, and compatibility with older software.',
      h1: 'Convert WebP to JPG',
      keywords: ['webp to jpg', 'webp to jpeg', 'convert webp to jpg', 'webp jpg converter', 'save webp as jpeg'],
    },
    seoContent: createClientImageSeoContent(
      'WebP is efficient for modern websites, but JPG is still the easiest choice for email attachments, office workflows, and older apps that do not fully support WebP. WittyFlip lets you turn WebP into JPG locally in your browser for a fast compatibility upgrade.',
      'This converter is especially useful for photos, blog assets, and marketplace uploads that accept JPG but reject WebP. Standard mode is lightweight and instant, while Enhanced quality can load a WebP WASM path when you need more consistent output from difficult source images.',
      'JPG does not support transparency, so transparent areas are flattened during export. Animated WebP files are converted from the first frame only, and browser-based conversions generally do not retain EXIF or ICC metadata.',
    ),
    faq: [
      { question: 'What happens to transparency in WebP to JPG?', answer: JPG_TRANSPARENCY_ANSWER },
      { question: 'Can I convert animated WebP files?', answer: WEBP_FIRST_FRAME_ANSWER },
      { question: 'Is WebP to JPG private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
      { question: 'Will metadata or color profiles be preserved?', answer: CLIENT_SIDE_IMAGE_METADATA_ANSWER },
      { question: 'When should I use Enhanced quality?', answer: WEBP_ENHANCED_ANSWER },
    ],
    relatedConversions: ['webp-to-png', 'jpg-to-webp', 'png-to-jpg'],
    clientConverter: 'canvas',
    clientConverterEnhanced: 'webp-wasm',
    estimatedSearchVolume: 1800000,
    launchPhase: 9,
    indexable: false,
  },
  {
    slug: 'png-to-webp',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'png',
    targetFormat: 'webp',
    sourceExtensions: ['.png'],
    sourceMimeTypes: ['image/png'],
    targetExtension: '.webp',
    targetMimeType: 'image/webp',
    formatColor: '#10b981',
    seo: {
      title: 'Convert PNG to WebP Online Free | WittyFlip',
      description: 'Convert PNG to WebP in your browser to shrink image size for the web while keeping the file on your device.',
      h1: 'Convert PNG to WebP',
      keywords: ['png to webp', 'convert png to webp', 'png webp converter', 'compress png to webp', 'save png as webp'],
    },
    seoContent: createClientImageSeoContent(
      'PNG is reliable and lossless, but it can be much heavier than WebP for web delivery. WittyFlip converts PNG to WebP locally in your browser so you can make images lighter for websites, landing pages, and product listings without uploading them to a server.',
      'This is a strong choice when you want faster page loads or smaller download sizes while keeping broad browser support. Standard mode uses the browser\'s built-in encoder, and Enhanced quality can load a WebP WASM codec on demand when you want more control over fidelity-sensitive exports.',
      'If your PNG includes transparency, WebP can preserve it. Browser-based image conversion usually strips embedded metadata, so treat the output as a clean delivery asset rather than a metadata-preserving archive copy.',
    ),
    faq: [
      { question: 'Will PNG to WebP keep transparency?', answer: 'Yes. WebP supports alpha transparency, so transparent backgrounds can be preserved when your PNG includes them.' },
      { question: 'Why convert PNG to WebP?', answer: 'WebP often produces noticeably smaller files than PNG, which helps websites load faster and reduces bandwidth for shared assets.' },
      { question: 'Is PNG to WebP private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
      { question: 'Will metadata or color profiles be preserved?', answer: CLIENT_SIDE_IMAGE_METADATA_ANSWER },
      { question: 'When should I use Enhanced quality?', answer: WEBP_ENHANCED_ANSWER },
    ],
    relatedConversions: ['jpg-to-webp', 'webp-to-png', 'png-to-jpg'],
    clientConverter: 'canvas',
    clientConverterEnhanced: 'webp-wasm',
    estimatedSearchVolume: 990000,
    launchPhase: 9,
    indexable: false,
  },
  {
    slug: 'avif-to-jpg',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'avif',
    targetFormat: 'jpg',
    sourceExtensions: ['.avif'],
    sourceMimeTypes: ['image/avif'],
    targetExtension: '.jpg',
    targetMimeType: 'image/jpeg',
    formatColor: '#8b5cf6',
    seo: {
      title: 'Convert AVIF to JPG Online Free | WittyFlip',
      description: 'Convert AVIF images to JPG in your browser for easy compatibility with older apps, sites, and editors.',
      h1: 'Convert AVIF to JPG',
      keywords: ['avif to jpg', 'avif to jpeg', 'convert avif to jpg', 'avif jpg converter', 'save avif as jpeg'],
    },
    seoContent: createClientImageSeoContent(
      'AVIF delivers excellent compression, but compatibility still lags behind JPG in many websites, editors, and office workflows. WittyFlip converts AVIF to JPG right in your browser so you can make modern images easier to share without a server upload step.',
      'This is useful when you need the broadest possible support for email, CMS uploads, or legacy image tooling. The conversion relies on native AVIF decoding in the browser, so modern browsers work best and older browsers may need an update.',
      'Because JPG is a lossy format, some recompression is expected, and transparent pixels are flattened during export. Browser-based conversions also tend to strip EXIF metadata and may not preserve ICC color profiles in the downloaded file.',
    ),
    faq: [
      { question: 'Do I need a modern browser for AVIF to JPG?', answer: AVIF_BROWSER_SUPPORT_ANSWER },
      { question: 'What happens to transparency in AVIF to JPG?', answer: JPG_TRANSPARENCY_ANSWER },
      { question: 'Will AVIF to JPG reduce image quality?', answer: 'Usually a little. Any AVIF to JPG conversion recompresses the image, so fine edges and gradients may look slightly different from the source.' },
      { question: 'Is AVIF to JPG private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
      { question: 'Will metadata or color profiles be preserved?', answer: CLIENT_SIDE_IMAGE_METADATA_ANSWER },
    ],
    relatedConversions: ['avif-to-png', 'jpg-to-webp', 'png-to-jpg'],
    clientConverter: 'canvas',
    estimatedSearchVolume: 670000,
    launchPhase: 9,
    indexable: false,
  },
  {
    slug: 'svg-to-png',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'svg',
    targetFormat: 'png',
    sourceExtensions: ['.svg'],
    sourceMimeTypes: ['image/svg+xml'],
    targetExtension: '.png',
    targetMimeType: 'image/png',
    formatColor: '#ef4444',
    seo: {
      title: 'Convert SVG to PNG Online Free | WittyFlip',
      description: 'Convert SVG to PNG in your browser for easy sharing, uploads, and apps that require a raster image.',
      h1: 'Convert SVG to PNG',
      keywords: ['svg to png', 'convert svg to png', 'svg png converter', 'save svg as png', 'rasterize svg'],
    },
    seoContent: createClientImageSeoContent(
      'SVG is a vector format, which makes it ideal for logos and icons, but many upload forms, chat tools, and publishing systems still expect PNG. WittyFlip converts SVG to PNG in your browser so you can export a widely accepted bitmap version without sending the file away.',
      'This is useful when you need a fixed-size image for social cards, docs, design handoff, or apps that reject SVG entirely. The converter renders the SVG locally and exports a PNG download that works in virtually every editor and browser.',
      'Because PNG is raster, the result is no longer infinitely scalable like SVG. Self-contained SVG files work best, and files that depend on external fonts, linked images, or remote styles should be embedded before conversion for the most faithful output.',
    ),
    faq: [
      { question: 'Will the PNG stay scalable like the SVG?', answer: 'No. PNG is a raster format, so the export has a fixed pixel size and will not stay infinitely scalable like the original SVG.' },
      { question: 'How is the PNG size chosen?', answer: 'The converter uses the SVG\'s own dimensions or viewport information. If you need a larger bitmap, increase the SVG dimensions before converting.' },
      { question: 'Will external fonts or linked images render?', answer: SVG_EXTERNAL_ASSETS_ANSWER },
      { question: 'Can SVG to PNG keep transparency?', answer: 'Yes. If the SVG has a transparent background, the PNG output can preserve that transparency.' },
      { question: 'Is SVG to PNG private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
    ],
    relatedConversions: ['png-to-jpg', 'png-to-webp', 'jpg-to-png'],
    clientConverter: 'canvas',
    estimatedSearchVolume: 500000,
    launchPhase: 9,
    indexable: false,
  },
  {
    slug: 'png-to-jpg',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'png',
    targetFormat: 'jpg',
    sourceExtensions: ['.png'],
    sourceMimeTypes: ['image/png'],
    targetExtension: '.jpg',
    targetMimeType: 'image/jpeg',
    formatColor: '#2563eb',
    seo: {
      title: 'Convert PNG to JPG Online Free | WittyFlip',
      description: 'Convert PNG images to JPG in your browser for smaller file sizes and better compatibility with sites that prefer JPEG uploads.',
      h1: 'Convert PNG to JPG',
      keywords: ['png to jpg', 'png to jpeg', 'convert png to jpg', 'png jpg converter', 'save png as jpeg'],
    },
    seoContent: createClientImageSeoContent(
      'PNG is excellent for screenshots, diagrams, and transparent assets, but JPG is often smaller and accepted by more upload forms. WittyFlip converts PNG to JPG directly in your browser so you can make files easier to share without sending them to a server.',
      'This conversion is especially useful for photos, marketplace uploads, and CMS workflows that only accept JPG. The browser handles the conversion locally, which keeps the process quick and private while producing a download ready for older software and common upload forms.',
      'Because JPG uses lossy compression, some detail changes are expected, and transparent pixels are flattened during export. Crisp UI graphics, text-heavy screenshots, and logos may still look better as PNG or WebP if absolute sharpness matters more than compatibility.',
    ),
    faq: [
      { question: 'What happens to transparency in PNG to JPG?', answer: JPG_TRANSPARENCY_ANSWER },
      { question: 'Will PNG to JPG reduce file size?', answer: 'Often yes, especially for photos and large screenshots. Flat graphics with hard edges may not shrink as much and can sometimes look better in PNG or WebP.' },
      { question: 'Is PNG to JPG lossy?', answer: 'Yes. JPG uses lossy compression, so some detail can change compared with the original PNG.' },
      { question: 'Is PNG to JPG private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
      { question: 'Will metadata or color profiles be preserved?', answer: CLIENT_SIDE_IMAGE_METADATA_ANSWER },
    ],
    relatedConversions: ['jpg-to-png', 'png-to-webp', 'webp-to-jpg'],
    clientConverter: 'canvas',
    estimatedSearchVolume: 400000,
    launchPhase: 9,
    indexable: false,
  },
  {
    slug: 'jpg-to-png',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'jpg',
    targetFormat: 'png',
    sourceExtensions: ['.jpg', '.jpeg'],
    sourceMimeTypes: ['image/jpeg'],
    targetExtension: '.png',
    targetMimeType: 'image/png',
    formatColor: '#f97316',
    seo: {
      title: 'Convert JPG to PNG Online Free | WittyFlip',
      description: 'Convert JPG images to PNG in your browser when you need a lossless container or a format accepted by PNG-only tools.',
      h1: 'Convert JPG to PNG',
      keywords: ['jpg to png', 'jpeg to png', 'convert jpg to png', 'jpg png converter', 'save jpeg as png'],
    },
    seoContent: createClientImageSeoContent(
      'JPG is common for photos, but some editors, design tools, and publishing systems work more smoothly with PNG. WittyFlip converts JPG to PNG locally in your browser so you can switch containers without uploading the file to a remote server.',
      'This is useful when a workflow requires PNG, when you want to avoid additional lossy saves after editing, or when you need a more predictable format for screenshots and composites. The visible pixels are carried over directly into a PNG file that is easy to reopen in image software.',
      'Converting JPG to PNG does not restore detail that JPG compression already removed, and it does not create transparency that was not present in the source. Think of it as a workflow and compatibility conversion rather than a quality-recovery tool.',
    ),
    faq: [
      { question: 'Does JPG to PNG improve image quality?', answer: 'No. It preserves the current pixels in a lossless PNG container, but it cannot recover detail that was already lost in the JPG.' },
      { question: 'Will JPG to PNG add transparency?', answer: 'No. If the JPG has no transparent pixels, the PNG will not magically create them during conversion.' },
      { question: 'Why convert JPG to PNG at all?', answer: 'It helps when a tool requires PNG, when you want a lossless format before editing, or when you need a PNG file for publishing workflows.' },
      { question: 'Is JPG to PNG private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
      { question: 'Will metadata or color profiles be preserved?', answer: CLIENT_SIDE_IMAGE_METADATA_ANSWER },
    ],
    relatedConversions: ['png-to-jpg', 'jpg-to-webp', 'webp-to-png'],
    clientConverter: 'canvas',
    estimatedSearchVolume: 325000,
    launchPhase: 9,
    indexable: false,
  },
  {
    slug: 'jpg-to-webp',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'jpg',
    targetFormat: 'webp',
    sourceExtensions: ['.jpg', '.jpeg'],
    sourceMimeTypes: ['image/jpeg'],
    targetExtension: '.webp',
    targetMimeType: 'image/webp',
    formatColor: '#14b8a6',
    seo: {
      title: 'Convert JPG to WebP Online Free | WittyFlip',
      description: 'Convert JPG to WebP in your browser for smaller web-ready image files with no server upload required.',
      h1: 'Convert JPG to WebP',
      keywords: ['jpg to webp', 'jpeg to webp', 'convert jpg to webp', 'jpg webp converter', 'compress jpeg to webp'],
    },
    seoContent: createClientImageSeoContent(
      'JPG works everywhere, but WebP often produces smaller files for websites, blogs, and product pages. WittyFlip converts JPG to WebP directly in your browser so you can make images lighter without sending them to a server.',
      'This is a practical choice when you want faster page loads, smaller uploads, or cleaner delivery assets for modern browsers. Standard mode uses the built-in browser encoder, and Enhanced quality can load a WebP WASM path on demand when you want more consistent fidelity for difficult images.',
      'Because the source JPG already has no transparency, the WebP output does not add alpha information that was never there. Browser-based conversion also tends to strip metadata, so the result is best treated as a web delivery file rather than an archival master.',
    ),
    faq: [
      { question: 'Why convert JPG to WebP?', answer: 'WebP often produces smaller files than JPG, which can improve page speed and reduce bandwidth for web images.' },
      { question: 'Should I use Enhanced quality for JPG to WebP?', answer: WEBP_ENHANCED_ANSWER },
      { question: 'Will JPG to WebP add transparency?', answer: 'No. WebP can support transparency, but converting a standard JPG does not create alpha data that was not in the source.' },
      { question: 'Is JPG to WebP private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
      { question: 'Will metadata or color profiles be preserved?', answer: CLIENT_SIDE_IMAGE_METADATA_ANSWER },
    ],
    relatedConversions: ['png-to-webp', 'webp-to-jpg', 'avif-to-jpg'],
    clientConverter: 'canvas',
    clientConverterEnhanced: 'webp-wasm',
    estimatedSearchVolume: 200000,
    launchPhase: 9,
    indexable: false,
  },
  {
    slug: 'avif-to-png',
    category: 'image',
    processingMode: 'client',
    sourceFormat: 'avif',
    targetFormat: 'png',
    sourceExtensions: ['.avif'],
    sourceMimeTypes: ['image/avif'],
    targetExtension: '.png',
    targetMimeType: 'image/png',
    formatColor: '#6366f1',
    seo: {
      title: 'Convert AVIF to PNG Online Free | WittyFlip',
      description: 'Convert AVIF to PNG in your browser to keep transparency and get a format that is easier to edit and share.',
      h1: 'Convert AVIF to PNG',
      keywords: ['avif to png', 'convert avif to png', 'avif png converter', 'save avif as png', 'avif transparent png'],
    },
    seoContent: createClientImageSeoContent(
      'AVIF is a modern, highly compressed format, but PNG is still easier to edit, preview, and reuse in many design and publishing workflows. WittyFlip converts AVIF to PNG in your browser so you can switch to a more universal format without uploading the image.',
      'This is a good option when you need transparent assets, a lossless container for further editing, or compatibility with software that still lags on AVIF support. The conversion relies on native AVIF decoding in your browser, so current desktop and mobile browsers work best.',
      'PNG output can preserve transparency that exists in the AVIF source, but file sizes are usually larger than AVIF. Browser-based conversions also tend to drop embedded metadata, so the exported PNG is best treated as a practical working copy.',
    ),
    faq: [
      { question: 'Do I need a modern browser for AVIF to PNG?', answer: AVIF_BROWSER_SUPPORT_ANSWER },
      { question: 'Does AVIF to PNG keep transparency?', answer: 'Yes. PNG supports alpha transparency, so transparent backgrounds can be preserved when the source AVIF includes them.' },
      { question: 'Why convert AVIF to PNG?', answer: 'PNG is easier to edit, more predictable in older tools, and often preferred for graphics workflows that need a lossless image format.' },
      { question: 'Is AVIF to PNG private?', answer: CLIENT_SIDE_IMAGE_PRIVACY_ANSWER },
      { question: 'Will metadata or color profiles be preserved?', answer: CLIENT_SIDE_IMAGE_METADATA_ANSWER },
    ],
    relatedConversions: ['avif-to-jpg', 'jpg-to-png', 'webp-to-png'],
    clientConverter: 'canvas',
    estimatedSearchVolume: 130000,
    launchPhase: 9,
    indexable: false,
  },
]

const slugIndex = new Map<string, ConversionType>(CONVERSION_TYPES.map(c => [c.slug, c]))

export function isServerConversion(conversion: ConversionType): conversion is ServerConversionType {
  return conversion.processingMode === 'server'
}

export function isClientConversion(conversion: ConversionType): conversion is ClientConversionType {
  return conversion.processingMode === 'client'
}

export function getConversionBySlug(slug: string): ConversionType | undefined {
  return slugIndex.get(slug)
}

export function getServerConversionBySlug(slug: string): ServerConversionType | undefined {
  const conversion = getConversionBySlug(slug)
  return conversion && isServerConversion(conversion) ? conversion : undefined
}

export function getClientConversionBySlug(slug: string): ClientConversionType | undefined {
  const conversion = getConversionBySlug(slug)
  return conversion && isClientConversion(conversion) ? conversion : undefined
}

export function isValidConversionType(slug: string): boolean {
  return slugIndex.has(slug)
}

export function getAllConversionTypes(): ConversionType[] {
  return [...CONVERSION_TYPES]
}

export function getConversionsByCategory(category: ConversionCategory): ConversionType[] {
  return CONVERSION_TYPES.filter((conversion) => conversion.category === category)
}

export function getServerConversions(): ServerConversionType[] {
  return CONVERSION_TYPES.filter(isServerConversion)
}

export function getClientConversions(): ClientConversionType[] {
  return CONVERSION_TYPES.filter(isClientConversion)
}

export function getIndexableConversions(): ConversionType[] {
  return CONVERSION_TYPES.filter((conversion) => conversion.indexable !== false)
}
