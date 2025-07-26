# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a World History Seminar repository containing presentation slides in Markdown format. The project uses Marp CLI to convert Markdown slides to HTML presentations and includes a custom TypeScript generator to create an index page.

## Commands

### Development
- `pnpm start` - Start the Marp development server with live reload
- `pnpm install` - Install dependencies (uses pnpm package manager)

### Build and Deploy
- `pnpm build` - Build all slides to HTML in `dist/` directory and generate index page
- `pnpm lint` - Run markdown linting on all slides

### Package Manager
This project uses `pnpm` as the package manager (specified in package.json). Always use `pnpm` instead of `npm` or `yarn`.

## Architecture

### Core Components
- **Slides Directory (`slides/`)**: Contains all presentation files in Markdown format
  - Files follow naming convention: `YYYYMMDD_author.md` (e.g., `20250727_kixixixixi.md`)
  - Each slide starts with a title (H1) that becomes the link text in the index
  - Slides use Marp-compatible Markdown syntax with `---` slide separators

- **Generator Script (`generate.ts`)**: TypeScript script that:
  - Scans all Markdown files in the slides directory
  - Extracts the first line (title) from each slide file
  - Generates an HTML index page (`dist/index.html`) with styled links to all presentations
  - Includes custom CSS styling for the index page

- **Images Directory (`slides/images/`)**: Organized by author subdirectories, contains images referenced in slides

### Build Process
1. Marp CLI converts Markdown slides to HTML files in `dist/`
2. Images are copied to `dist/images/` using cpx
3. Custom generator script creates the index page with links to all slides

### Configuration
- **Marp Configuration**: HTML output enabled in package.json
- **TypeScript**: Standard configuration with ES2018 target and CommonJS modules
- **Linting**: Uses markdownlint-cli for Markdown files

### Deployment
The project is deployed to Netlify at https://world-history.netlify.app/

## File Structure Notes
- Slides are authored by multiple contributors (kixixixixi, hanamizuno, ihara, hasegawa, nishihara, hm)
- The `_/` subdirectory in slides contains additional reference materials
- Git hooks are configured via Husky for pre-commit linting