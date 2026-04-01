import * as core from '@actions/core';
import {
  createOctokit,
  getPRDetails,
  getPRDiff,
  getPRFiles,
  getFullFileContexts,
  getPRComments,
  postComment,
  postReview,
} from './github.js';
import { detectReviewState } from './state.js';
import { callClaude } from './anthropic.js';
import { buildInitialPrompt, buildReReviewPrompt } from './prompts.js';
import { parseDiffLines } from './diff.js';
import { buildInitialComment, buildReReviewComment } from './format.js';

export async function runReview({ githubToken, anthropicKey, model, maxFiles, maxFileChars, prNumber, repo }) {
  const { owner, repo: repoName } = repo;
  const octokit = createOctokit(githubToken);

  // ── 1. Fetch core PR data ────────────────────────────────────────────────────
  const [pr, diff, files] = await Promise.all([
    getPRDetails(octokit, owner, repoName, prNumber),
    getPRDiff(octokit, owner, repoName, prNumber),
    getPRFiles(octokit, owner, repoName, prNumber),
  ]);

  const currentSha = pr.head.sha;
  core.info(`📌 Head SHA: ${currentSha.slice(0, 7)} · ${files.length} file(s) changed`);

  // ── 2. Detect review state ────────────────────────────────────────────────────
  const { alreadyReviewed, isReReview } = await detectReviewState(
    octokit, owner, repoName, prNumber, currentSha
  );

  if (alreadyReviewed) {
    core.info(`⏭️  Already reviewed PR #${prNumber} at ${currentSha.slice(0, 7)}, skipping.`);
    return;
  }

  core.info(isReReview
    ? `🔁 Re-reviewing PR #${prNumber} (new commit pushed after prior feedback)`
    : `✨ Fresh review for PR #${prNumber}`);

  // ── 3. Fetch full file contents ───────────────────────────────────────────────
  core.info(`📂 Fetching full content for up to ${maxFiles} changed file(s)...`);
  const fileContexts = await getFullFileContexts(
    octokit, owner, repoName, files, currentSha, maxFiles, maxFileChars
  );
  core.info(`✅ Got full context for ${fileContexts.length} file(s)`);

  // ── 4. Fetch conversation history (re-reviews only) ───────────────────────────
  let prComments = [];
  if (isReReview) {
    core.info('📬 Fetching PR conversation history...');
    prComments = await getPRComments(octokit, owner, repoName, prNumber);
    core.info(`💬 Found ${prComments.length} prior comment(s)`);
  }

  // ── 5. Build prompt and call Claude ──────────────────────────────────────────
  const prompt = isReReview
    ? buildReReviewPrompt(pr, diff, files, fileContexts, prComments)
    : buildInitialPrompt(pr, diff, files, fileContexts);

  core.info(`🧠 Calling Claude (${model})...`);
  const review = await callClaude(anthropicKey, model, prompt);
  core.info(`📋 Verdict: ${review.verdict}`);

  // ── 6. Build comment body (SHA embedded for stateless re-review detection) ────
  const summaryBody = isReReview
    ? buildReReviewComment(review, owner, repoName, currentSha)
    : buildInitialComment(review, owner, repoName, currentSha);

  // ── 7. Filter inline comments to valid diff line positions ────────────────────
  const validLines = parseDiffLines(diff);
  const inlineComments = (review.inline_comments || [])
    .filter(c => {
      const lines = validLines[c.path];
      return lines && lines.has(Number(c.line));
    })
    .slice(0, 10)
    .map(c => ({
      path: c.path,
      line: Number(c.line),
      side: 'RIGHT',
      body: `🤖 ${c.comment}`,
    }));

  core.info(`💬 ${inlineComments.length} valid inline comment(s)`);

  // ── 8. Post the review ────────────────────────────────────────────────────────
  if (inlineComments.length > 0) {
    try {
      await postReview(octokit, owner, repoName, prNumber, currentSha, inlineComments, summaryBody);
      core.info(`✅ Posted review with ${inlineComments.length} inline comment(s)`);
    } catch (err) {
      core.warning(`Inline review failed (${err.message}), falling back to plain comment`);
      await postComment(octokit, owner, repoName, prNumber, summaryBody);
      core.info('✅ Posted summary comment (fallback)');
    }
  } else {
    await postComment(octokit, owner, repoName, prNumber, summaryBody);
    core.info('✅ Posted summary comment');
  }
}
