# Design Spec: Dual-Target Deployment Architecture for Dev and Main Branches

## 1. Overview
The objective is to establish an automated CI/CD pipeline in `youtube_frontend` that routes and isolates deployments according to environment responsibilities:
- **`dev` branch**: Staged and hosted under GitHub Pages subdirectory **`https://hausemasterz.github.io/youtube/dev/`**.
- **`main` branch**: Hosted on Cloudflare Pages as the production deployment powering the custom apex/subdomain **`https://music.hausemaster.tech`** directly at root `/` (with **`https://hausemasterz.github.io/youtube/`** serving the production fallback).

---

## 2. Architecture & Edge Routing

```mermaid
flowchart TD
    subgraph Git_Repository [GitHub Repository: HauseMasterZ/youtube]
        MainBranch[Branch: main]
        DevBranch[Branch: dev]
    end

    subgraph CI_Pipeline [GitHub Actions: deploy.yaml]
        direction TB
        GHP_Job["Job: deploy-github-pages\n(Runs on main & dev)"]
        CF_Job["Job: deploy-cloudflare\n(Runs strictly on main)"]
    end

    subgraph GitHub_Pages_Dist [GitHub Pages Distribution]
        RootMain["site-root/ (From main)\nURL: hausemasterz.github.io/youtube/"]
        SubDev["site-root/dev/ (From dev)\nURL: hausemasterz.github.io/youtube/dev/"]
    end

    subgraph Cloudflare_Pages_Dist [Cloudflare Pages Production Edge]
        CFRoot["site-root/ (From main only)\nURL: music.hausemaster.tech/"]
    end

    MainBranch -->|Push| GHP_Job
    DevBranch -->|Push| GHP_Job
    MainBranch -->|Push (if main)| CF_Job

    GHP_Job --> RootMain
    GHP_Job --> SubDev
    CF_Job --> CFRoot
```

---

## 3. Pipeline Specifications

### 3.1. Job 1: `deploy-github-pages`
- **Execution Condition**: Pushes to `main` or `dev`, plus `workflow_dispatch`.
- **Permissions**: `pages: write`, `id-token: write`, `deployments: write`.
- **Environment**: `github-pages`.
- **Checkout Strategy**:
  1. Primary checkout: `ref: main` into `site-root/`.
  2. Secondary checkout: `ref: dev` into `dev-src/`.
  3. Merge: Copy `dev-src/` into `site-root/dev/` (excluding `.git` and `.github`).
- **Build & Minification**:
  - Run Node-based minification across both `site-root/` and `site-root/dev/`.
  - JS bundling: 8 modules (`state.js`, `dom.js`, `utils.js`, `ui.js`, `mediaSession.js`, `lyrics.js`, `playback.js`, `main.js`) bundled into `bundle.min.js?v=<sha>`.
  - CSS minification and critical CSS inlining into `index.html`.
  - Service Worker cache naming:
    - Root: `const CACHE_NAME = 'yt-player-cache-main-<sha>';`
    - Dev: `const CACHE_NAME = 'yt-player-cache-dev-<sha>';`
- **Deployment**:
  - `actions/upload-pages-artifact@v3` with path `site-root`.
  - `actions/deploy-pages@v4`.
- **GH013 Compliance**: Because GitHub Pages deployment runs on every commit pushed to `main` and `dev`, the required active deployment record is generated for every commit SHA, completely preventing `GH013` push blocks.

### 3.2. Job 2: `deploy-cloudflare`
- **Execution Condition**: `if: github.ref == 'refs/heads/main'`
- **Permissions**: `contents: read`, `deployments: write`.
- **Environment**: `production-edge`.
- **Checkout Strategy**:
  - Single checkout of `ref: main` into `site-root/`.
  - Staging `/dev/` files are completely excluded from Cloudflare Pages to keep production edge clean and avoid duplicate uploads.
- **Build & Minification**:
  - Minifies root `site-root/` only.
- **Deployment**:
  - Wrangler CLI: `wrangler pages deploy site-root --project-name="${PROJECT}" --branch="main" --commit-dirty=true`.
  - Cloudflare Pages assigns the deployment to the Production branch (`main`).
  - Custom domain **`https://music.hausemaster.tech`** automatically serves this production build.
  - Zero Cloudflare preview deployments generated when developing on `dev`.

---

## 4. State & Scope Isolation
1. **Relative Paths**:
   All asset references in `index.html` remain strictly relative (`css/style.css`, `js/bundle.min.js`), allowing seamless resolution under both root `/` and `/dev/`.
2. **Service Worker Scopes**:
   - At `/`: Service worker scopes to `/youtube/` on GitHub Pages, and `/` on Cloudflare Pages.
   - At `/dev/`: Service worker registers at `'sw.js'`, scoping strictly to `/youtube/dev/`.
   - Distinct cache names ensure cache entries never cross-pollinate.
3. **PWA Manifest**:
   The manifest uses relative icons and start URLs, maintaining self-contained PWA installation at both root and staging.

---

## 5. Verification Plan

### 5.1. Automated Unit Tests
- Execute full unit test suite locally:
  ```powershell
  pytest tests/
  ```
  Target: 156 passed, 0 failed.

### 5.2. CI/CD Deployment Verification
- Push commit to `origin/dev`.
- Verify GitHub Actions run:
  - `deploy-github-pages`: Succeeded.
  - `deploy-cloudflare`: Skipped (as expected on `dev`).
- Verify endpoints:
  - `curl -sI https://hausemasterz.github.io/youtube/dev/` -> HTTP 200 OK.
  - `curl -ik https://hausemasterz.github.io/youtube/dev/` -> Contains updated bundle SHA from `dev`.

### 5.3. Production Synchronization & Custom Domain Verification
- Merge `dev` into `main` and push to `origin/main`.
- Verify GitHub Actions run:
  - `deploy-github-pages`: Succeeded.
  - `deploy-cloudflare`: Succeeded.
- Verify endpoints:
  - `curl -sI https://music.hausemaster.tech` -> HTTP 200 OK (Server: cloudflare).
  - `curl -sI https://hausemasterz.github.io/youtube/` -> HTTP 200 OK (Server: GitHub.com).
  - `curl -sI https://hausemasterz.github.io/youtube/dev/` -> HTTP 200 OK.
