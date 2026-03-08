// NOTE: --base-url /dev/null only constrains local relative resource resolution.
// It is NOT sufficient SSRF protection on its own. The HTML->PDF execution
// environment must have no outbound network access (e.g. --network=none) before
// this converter is considered production-ready.

import type { Converter } from '~/lib/converters/index'
import { runSimpleConversion } from '~/lib/converters/converter-run'

export const WEASYPRINT_RUNTIME_PREREQUISITE =
  'Runtime network isolation is required for HTML to PDF; --base-url /dev/null is not SSRF protection.'

export const weasyprintConverter: Converter = {
  convert: (inputPath, outputPath, signal) =>
    runSimpleConversion(
      'weasyprint',
      [inputPath, outputPath, '--presentational-hints', '--base-url', '/dev/null'],
      outputPath,
      signal,
    ),
}
