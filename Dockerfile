# Build do app desktop Linux (.deb e .AppImage) via Tauri, em ambiente reprodutível.
# Não gera o executável Windows (.exe) — isso é feito nativamente no GitHub Actions
# (ver .github/workflows/desktop-build.yml), já que cross-compile de GUI nativa entre
# plataformas não é o caminho suportado pelo Tauri.
#
# Uso (requer Docker BuildKit, habilitado por padrão no Docker 23+):
#   DOCKER_BUILDKIT=1 docker build --target artifacts --output dist-linux .
#
# Os instaladores (.deb/.AppImage) são extraídos direto para ./dist-linux na máquina host.

FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# dependências de sistema do Tauri v2 no Linux + Node.js 22 (via NodeSource)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    file \
    build-essential \
    libwebkit2gtk-4.1-dev \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    ca-certificates \
    gnupg \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# Rust via rustup (toolchain estável)
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal

WORKDIR /app

# instala dependências Node primeiro (cache de camada separado do código-fonte)
COPY package.json package-lock.json ./
RUN npm ci

# instala dependências Rust separadamente também, para cachear a compilação de crates
# (Cargo.lock é opcional aqui: se existir no repo, é copiado e reutilizado; senão, o cargo
# fetch abaixo gera um na hora)
COPY src-tauri/Cargo.toml ./src-tauri/
COPY src-tauri/Cargo.loc[k] ./src-tauri/
RUN mkdir -p src-tauri/src && echo "fn main() {}" > src-tauri/src/main.rs \
  && cd src-tauri && cargo fetch && cd .. \
  && rm -rf src-tauri/src

# código-fonte completo
COPY . .

RUN npm run desktop:build

# imagem final: só os artefatos gerados, extraídos via `docker build --output` (ver topo do arquivo)
FROM scratch AS artifacts
COPY --from=builder /app/src-tauri/target/release/bundle /bundle
