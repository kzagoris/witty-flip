# External Dependencies Installation Guide

WittyFlip relies on six external command-line tools for document conversion. This guide covers installation on **Windows** and **Ubuntu/Debian**.

## Quick Reference

| Tool | Binary | Used By | Conversions |
|------|--------|---------|-------------|
| Pandoc | `pandoc` | pandoc converter | DOCX→Markdown, Markdown→PDF, ODT→DOCX |
| WeasyPrint | `weasyprint` | pandoc (as `--pdf-engine`) + weasyprint converter | Markdown→PDF, HTML→PDF |
| DjVuLibre | `ddjvu` | djvulibre converter | DjVu→PDF |
| Calibre | `ebook-convert` | calibre converter | EPUB→MOBI |
| TeX Live | `pdflatex` | pdflatex converter | LaTeX→PDF |
| LibreOffice | `libreoffice` | libreoffice converter | ODT→DOCX (fallback) |

## Windows Package Manager Availability

| Tool | Scoop | Winget |
|------|-------|--------|
| Pandoc | `main/pandoc` | `JohnMacFarlane.Pandoc` |
| WeasyPrint | `main/weasyprint` | N/A |
| DjVuLibre | `main/djvulibre` | `DjVuLibre.DjView` |
| Calibre | `extras/calibre` | `calibre.calibre` |
| MiKTeX | `main/miktex` | `MiKTeX.MiKTeX` |
| LibreOffice | `extras/libreoffice` | `TheDocumentFoundation.LibreOffice` |

## Node.js & npm

The application itself requires Node.js 20+.

### Windows

```powershell
# Scoop (recommended)
scoop install nodejs-lts

# Winget
winget install OpenJS.NodeJS.LTS

# Or use fnm version manager
scoop install fnm
fnm install --lts
```

### Ubuntu

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## 1. Pandoc

Universal document converter. Used for DOCX→Markdown, Markdown→PDF (via WeasyPrint engine), and ODT→DOCX.

### Windows

```powershell
# Scoop (recommended)
scoop install pandoc

# Winget
winget install JohnMacFarlane.Pandoc
```

Verify: `pandoc --version`

### Ubuntu

```bash
sudo apt-get install -y pandoc
```

> **Note:** The Ubuntu repository version may be older. For the latest version, download the `.deb` from https://github.com/jgm/pandoc/releases:
>
> ```bash
> wget https://github.com/jgm/pandoc/releases/download/3.6.4/pandoc-3.6.4-1-amd64.deb
> sudo dpkg -i pandoc-3.6.4-1-amd64.deb
> ```

---

## 2. WeasyPrint

HTML/CSS-to-PDF rendering engine. Used directly for HTML→PDF and as Pandoc's `--pdf-engine` for Markdown→PDF.

### Windows

```powershell
# Scoop (recommended — handles GTK dependencies automatically)
scoop install weasyprint
```

Scoop is the easiest option because it bundles the required GTK/Pango libraries. No extra steps needed.

**Alternative (pip — requires manual GTK setup):**

```powershell
# Install Python if not present
scoop install python
# or: winget install Python.Python.3.12

pip install weasyprint
```

When installing via pip, WeasyPrint needs GTK libraries separately. Install MSYS2 and add GTK:

```powershell
scoop install msys2
# or: winget install MSYS2.MSYS2

# In MSYS2 UCRT64 terminal:
pacman -S mingw-w64-ucrt-x86_64-pango mingw-w64-ucrt-x86_64-gtk3
```

Then add the MSYS2 binary path to your system PATH (e.g., `C:\msys64\ucrt64\bin`).

Verify: `weasyprint --version`

### Ubuntu

```bash
sudo apt-get install -y weasyprint
```

Or install the latest via pip:

```bash
# Install system dependencies first
sudo apt-get install -y python3-pip python3-cffi libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev libcairo2

pip install weasyprint
```

---

## 3. DjVuLibre

Reference implementation of the DjVu format. Provides the `ddjvu` command for DjVu→PDF conversion.

### Windows

```powershell
# Scoop (recommended)
scoop install djvulibre

# Winget (installs DjView GUI which includes DjVuLibre tools)
winget install DjVuLibre.DjView
```

With winget, you may need to add the install directory to your PATH manually (typically `C:\Program Files\DjVuLibre`).

Verify: `ddjvu --help`

### Ubuntu

```bash
sudo apt-get install -y djvulibre-bin
```

---

## 4. Calibre

Ebook management tool. Provides `ebook-convert` for EPUB→MOBI conversion.

### Windows

```powershell
# Scoop (recommended — requires extras bucket)
scoop bucket add extras
scoop install calibre

# Winget
winget install calibre.calibre
```

Verify: `ebook-convert --version`

### Ubuntu

```bash
sudo apt-get install -y calibre
```

Or install the latest version:

```bash
sudo -v && wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh | sudo sh /dev/stdin
```

---

## 5. TeX Live (pdflatex)

LaTeX distribution providing `pdflatex` for LaTeX→PDF compilation.

### Windows

MiKTeX is recommended for Windows — it auto-installs LaTeX packages on demand.

```powershell
# Scoop (recommended)
scoop install miktex

# Winget
winget install MiKTeX.MiKTeX
```

**Alternative: TeX Live (full distribution)**

Download from https://www.tug.org/texlive/acquire-netinstall.html and run `install-tl-windows.bat`.

Verify: `pdflatex --version`

### Ubuntu

```bash
# Minimal install (recommended — smaller download)
sudo apt-get install -y texlive-latex-base texlive-fonts-recommended texlive-latex-recommended

# Full install (all packages, ~5GB)
sudo apt-get install -y texlive-full
```

---

## 6. LibreOffice

Office suite used as a fallback for ODT→DOCX conversion. Runs in headless mode.

### Windows

```powershell
# Scoop (requires extras bucket)
scoop bucket add extras
scoop install libreoffice

# Winget
winget install TheDocumentFoundation.LibreOffice
```

With winget, you may need to add LibreOffice to PATH manually (typically `C:\Program Files\LibreOffice\program\`).

Verify: `libreoffice --version`

### Ubuntu

```bash
sudo apt-get install -y libreoffice
```

---

## Verify All Dependencies

Run these commands to confirm everything is installed:

```bash
pandoc --version
weasyprint --version
ddjvu --help 2>&1 | head -1
ebook-convert --version
pdflatex --version
libreoffice --version
```

## Windows — Install Everything at Once

### Scoop (recommended)

```powershell
# Add extras bucket (needed for calibre and libreoffice)
scoop bucket add extras

# Install all tools
scoop install pandoc weasyprint djvulibre miktex calibre libreoffice
```

### Winget

```powershell
winget install JohnMacFarlane.Pandoc
winget install DjVuLibre.DjView
winget install calibre.calibre
winget install MiKTeX.MiKTeX
winget install TheDocumentFoundation.LibreOffice
# WeasyPrint: not available on winget — use scoop or pip
```

## Ubuntu — Install Everything at Once

```bash
sudo apt-get update
sudo apt-get install -y \
  pandoc \
  weasyprint \
  djvulibre-bin \
  calibre \
  texlive-latex-base texlive-fonts-recommended texlive-latex-recommended \
  libreoffice
```

## Development vs Production

For **local development**, you only need the tools for the conversion types you are testing. If you are working on UI or API code, none of these are required — the converters will simply return errors for missing tools.

For **production** (Docker), all tools are installed in the Dockerfile. You do not need to install them on the host machine.
