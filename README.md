# 🤖 PR Review Agent

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-PR%20Review%20Agent-blue?logo=github)](https://github.com/marketplace/actions/pr-review-agent)
[![Node 20](https://img.shields.io/badge/node-20-green?logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An AI-powered GitHub Action that reviews pull requests using Claude — not just the diff, but the **full file context**. It understands your whole codebase, tracks conversations across commits, and posts structured inline feedback directly on the PR.

---

## ✨ What it does

- **Full-context analysis** — fetches the complete source of every changed file, not just the diff. Catches N+1s in untouched methods, missing auth checks across the whole controller, architectural issues you'd never spot from a patch alone.
- **Conversation-aware re-reviews** — when a new commit is pushed after feedback, it reads the entire PR conversation, checks what was resolved vs. still open, and posts a structured follow-up.
- **Inline comments** — posts feedback directly on the relevant lines, not just a wall-of-text summary.
- **Stateless** — no database or external storage. Uses a hidden SHA marker in review bodies to track what's been reviewed.

---

## 🚀 Quick Start

1. Add your Anthropic API key to your repo secrets as `ANTHROPIC_API_KEY`
2. Create `.github/workflows/pr-review.yml`:

```yaml
name: PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: sahildarji29/pr-review-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

That's it. Open a PR and the bot will post a review automatically.

---

## ⚙️ Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | ✅ Yes | — | GitHub token. Use `secrets.GITHUB_TOKEN` |
| `anthropic-api-key` | ✅ Yes | — | Your Anthropic API key |
| `model` | No | `claude-haiku-4-20250307` | Claude model to use |
| `max-files` | No | `8` | Max files to fetch full content for |
| `max-file-chars` | No | `8000` | Max characters per file (to control token usage) |

---

## 🔐 Required Permissions

Your workflow job needs these permissions:

```yaml
permissions:
  contents: read        # to fetch file contents from the PR branch
  pull-requests: write  # to post review comments
```

---

## 🔧 How it works

### Step 1 — Fetch context
For each changed file, the action fetches the **complete source** from the PR branch (not just the changed lines). Files are prioritised by number of changes and capped at `max-file-chars` to keep token usage reasonable.

### Step 2 — Detect review mode
The action checks whether it has already reviewed this exact commit SHA by looking for a hidden marker (`<!-- pr-review-sha: SHA -->`) in existing review bodies. If a prior review exists at a different SHA, it enters **re-review mode** and fetches the full PR conversation.

### Step 3 — Call Claude
The prompt includes full file contents + the diff + (for re-reviews) the conversation history. Claude is asked to evaluate:
- Functional correctness, edge cases, null safety
- Laravel patterns (Eloquent, form requests, policies, jobs, etc.)
- Security (mass assignment, auth gaps, IDOR, XSS, CSRF)
- Performance (N+1 queries across full methods, not just changed lines)
- Architecture (fat controllers, wrong layer, missing abstractions)
- Error handling, API contracts

### Step 4 — Post review
Inline comments are posted on valid diff positions. If the inline review API fails, it falls back to a plain PR comment.

---

## 💬 Review comment formats

### Initial review
```
## 🤖 PR-Review 🔴

This PR adds a refund processing flow. The Stripe integration is clean,
but there are authorization and validation gaps that need attention.

### 🐛 Functional Issues
- processRefund() has no authorize() call — any authenticated user can refund any payment
- currency is not validated before DB insert

### Key Findings
- PaymentController.php: Missing policy check on new method
- RefundService.php: No try/catch around Stripe API call
- Missing DB transaction wrapping refund + ledger insert
```

### Follow-up review (after new commit)
```
## 🤖 PR-Review (Follow-up) 💬

Good progress — the authorization and validation issues were addressed.
One concern remains around error handling.

### ✅ Resolved
- authorize() added to processRefund()
- currency validation added to form request

### ⚠️ Still Open
- RefundService still has no try/catch around the Stripe call

### 💬 In Response to Your Comments
> "Should I wrap this in a job?"
Yes — since this hits an external API and may be slow, a queued job is the right approach here.
```

---

## 🔑 Getting an Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account and navigate to **API Keys**
3. Create a new key and add it to your GitHub repo under **Settings → Secrets → Actions** as `ANTHROPIC_API_KEY`

---

## 🤝 Contributing

Pull requests welcome. The action is structured as:

```
src/
  index.js     — entry point, reads GitHub Actions inputs
  review.js    — orchestration
  github.js    — all GitHub API calls (Octokit)
  anthropic.js — Claude API call
  prompts.js   — prompt builders (initial + re-review)
  diff.js      — diff parser for valid inline comment positions
  state.js     — stateless re-review detection via SHA markers
  format.js    — comment formatters
```

To test locally, you'll need to mock the GitHub Actions context or use [act](https://github.com/nektos/act).

---

## 📄 License

MIT
