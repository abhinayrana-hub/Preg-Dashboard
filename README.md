# Pregnancy Planner

A React + MUI pregnancy calendar that reads dates from `pregnancy-data.xlsx`, highlights key weeks, and syncs updates back to the repo using the GitHub API.

## Features

- Monthly calendar with highlighted dates
- Current week banner and ultrasound focus
- Data pulled from `public/data/pregnancy-data.xlsx` (converted to JSON in the frontend)
- Add appointments in the UI
- Sync updates to both JSON and Excel files via GitHub API

## Getting started

```bash
npm install
npm run dev
```

## Data schema

`public/data/pregnancy-data.xlsx` and `public/data/pregnancy-data.json` use:

- `date` (YYYY-MM-DD)
- `type`
- `title`
- `notes`

## GitHub sync

1. Generate a classic PAT with `repo` scope.
2. Open the app and add the GitHub owner, repo, branch, and token.
3. Click **Sync to GitHub** to update:
   - `public/data/pregnancy-data.json`
   - `public/data/pregnancy-data.xlsx`

Settings are stored in localStorage only.

## GitHub Pages

This repo includes a GitHub Actions workflow that builds the app and deploys to GitHub Pages on every push to `main`.

If you deploy under a project site and assets do not load, update `base` in `vite.config.js`.
# Preg-Dashboard
