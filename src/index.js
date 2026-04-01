import * as core from '@actions/core';
import * as github from '@actions/github';
import { runReview } from './review.js';

async function main() {
  const githubToken  = core.getInput('github-token', { required: true });
  const anthropicKey = core.getInput('anthropic-api-key', { required: true });
  const model        = core.getInput('model') || 'claude-haiku-4-20250307';
  const maxFiles     = parseInt(core.getInput('max-files') || '8', 10);
  const maxFileChars = parseInt(core.getInput('max-file-chars') || '8000', 10);

  const ctx = github.context;
  if (!['pull_request', 'pull_request_target'].includes(ctx.eventName)) {
    core.info('Not a pull_request event, skipping.');
    return;
  }

  const prNumber = ctx.payload.pull_request.number;
  const repo     = ctx.repo; // { owner, repo }

  core.info(`🔍 Reviewing PR #${prNumber} in ${repo.owner}/${repo.repo}...`);

  await runReview({ githubToken, anthropicKey, model, maxFiles, maxFileChars, prNumber, repo });
}

main().catch(err => core.setFailed(err.message));
