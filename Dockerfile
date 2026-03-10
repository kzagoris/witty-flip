FROM node:20-slim

RUN apt-get update && apt-get install -y \
    calibre \
    curl \
    djvulibre-bin \
    libreoffice-writer \
    pandoc \
    texlive-latex-base \
    texlive-fonts-recommended \
    weasyprint \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m appuser
USER appuser

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"]
