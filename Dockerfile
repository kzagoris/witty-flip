FROM node:20-slim

RUN apt-get update && apt-get install -y \
    pandoc \
    libreoffice-writer \
    djvulibre-bin \
    calibre \
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
CMD ["node", ".output/server/index.mjs"]
