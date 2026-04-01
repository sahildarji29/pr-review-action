import { embedSha } from './state.js';

const VERDICT_EMOJI = { APPROVE: '✅', REQUEST_CHANGES: '🔴', COMMENT: '💬' };
const ACTION_URL = 'https://github.com/marketplace/actions/pr-review-agent';

/**
 * Build the GitHub review comment body for an initial (first-time) review.
 */
export function buildInitialComment(review, owner, repo, commitSha) {
  const emoji = VERDICT_EMOJI[review.verdict] || '💬';

  const functionalSection = review.functional_issues?.length
    ? `\n### 🐛 Functional Issues\n${review.functional_issues.map(i => `- ${i}`).join('\n')}`
    : '';

  const highlightsSection = review.highlights?.length
    ? `\n### Key Findings\n${review.highlights.map(h => `- ${h}`).join('\n')}`
    : '';

  const body = [
    `## 🤖 PR-Review ${emoji}`,
    '',
    review.summary,
    functionalSection,
    highlightsSection,
    '',
    '---',
    `*Automated review by [PR-Review Action](${ACTION_URL}) · Full-context analysis · [${owner}/${repo}](https://github.com/${owner}/${repo})*`,
  ].join('\n');

  return embedSha(body, commitSha);
}

/**
 * Build the GitHub review comment body for a follow-up re-review.
 */
export function buildReReviewComment(review, owner, repo, commitSha) {
  const emoji = VERDICT_EMOJI[review.verdict] || '💬';

  const resolvedSection = review.resolved_items?.length
    ? `\n### ✅ Resolved\n${review.resolved_items.map(i => `- ${i}`).join('\n')}`
    : '';

  const stillOpenSection = review.still_open?.length
    ? `\n### ⚠️ Still Open\n${review.still_open.map(i => `- ${i}`).join('\n')}`
    : '';

  const newIssuesSection = review.new_issues?.length
    ? `\n### 🆕 New Issues\n${review.new_issues.map(i => `- ${i}`).join('\n')}`
    : '';

  const qaSection = review.author_questions_answered
    ? `\n### 💬 In Response to Your Comments\n${review.author_questions_answered}`
    : '';

  const highlightsSection = review.highlights?.length
    ? `\n### Key Findings\n${review.highlights.map(h => `- ${h}`).join('\n')}`
    : '';

  const body = [
    `## 🤖 PR-Review (Follow-up) ${emoji}`,
    '',
    review.summary,
    resolvedSection,
    stillOpenSection,
    newIssuesSection,
    qaSection,
    highlightsSection,
    '',
    '---',
    `*Automated follow-up review by [PR-Review Action](${ACTION_URL}) · Full-context analysis · [${owner}/${repo}](https://github.com/${owner}/${repo})*`,
  ].join('\n');

  return embedSha(body, commitSha);
}
