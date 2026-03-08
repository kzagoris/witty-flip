import { registerIfAbsent } from '~/lib/converters/index'
import { pandocConverter } from '~/lib/converters/pandoc'
import { djvulibreConverter } from '~/lib/converters/djvulibre'
import { calibreConverter } from '~/lib/converters/calibre'
import { weasyprintConverter } from '~/lib/converters/weasyprint'
import { pdflatexConverter } from '~/lib/converters/pdflatex'
import { libreofficeConverter } from '~/lib/converters/libreoffice'

export function registerAllConverters(): void {
  registerIfAbsent('pandoc', pandocConverter)
  registerIfAbsent('djvulibre', djvulibreConverter)
  registerIfAbsent('calibre', calibreConverter)
  registerIfAbsent('weasyprint', weasyprintConverter)
  registerIfAbsent('pdflatex', pdflatexConverter)
  registerIfAbsent('libreoffice', libreofficeConverter)
}
