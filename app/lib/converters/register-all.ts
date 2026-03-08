import { registerConverter } from '~/lib/converters/index'
import { pandocConverter } from '~/lib/converters/pandoc'
import { djvulibreConverter } from '~/lib/converters/djvulibre'
import { calibreConverter } from '~/lib/converters/calibre'
import { weasyprintConverter } from '~/lib/converters/weasyprint'
import { pdflatexConverter } from '~/lib/converters/pdflatex'
import { libreofficeConverter } from '~/lib/converters/libreoffice'

let registered = false

export function registerAllConverters(): void {
  if (registered) return
  registered = true

  registerConverter('pandoc', pandocConverter)
  registerConverter('djvulibre', djvulibreConverter)
  registerConverter('calibre', calibreConverter)
  registerConverter('weasyprint', weasyprintConverter)
  registerConverter('pdflatex', pdflatexConverter)
  registerConverter('libreoffice', libreofficeConverter)
}
