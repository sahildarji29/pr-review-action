import { getExistingBotReviews } from './github.js';

export const SHA_MARKER = '<!-- pr-review-sha:';

/**
 * Embed the reviewed commit SHA as a hidden HTML comment in the review body.
 * This is how we detect re-reviews statelessly — no DB, no files.
 */
export function embedSha(body, sha) {
  return `${body}\n${SHA_MARKER}${sha} -->`;
}

/**
 * Detect whether the PR has already been reviewed at this SHA,
 * and whether this is a re-review (prior reviews exist at different SHAs).
 *
 * Strategy: look for our SHA_MARKER in existing review bodies.
 * Works with both github-actions[bot] and PAT-authenticated users.
 */
export async function detectReviewState(octokit, owner, repo, prNumber, currentSha) {
  const reviews = await getExistingBotReviews(octokit, owner, repo, prNumber);

  // All reviews that contain our marker (i.e. posted by this action)
  const ourReviews = reviews.filter(r => r.body && r.body.includes(SHA_MARKER));

  if (ourReviews.some(r => r.body.includes(`${SHA_MARKER}${currentSha}`))) {
    return { alreadyReviewed: true, isReReview: false };
  }

  return { alreadyReviewed: false, isReReview: ourReviews.length > 0 };
}
