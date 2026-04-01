import { Octokit } from '@octokit/rest';

export function createOctokit(token) {
  const octokit = new Octokit({ auth: token });
  octokit._token = token; // store for raw fetch calls
  return octokit;
}

export async function getPRDetails(octokit, owner, repo, prNumber) {
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
  return data;
}

/**
 * Fetch raw unified diff. Octokit doesn't return raw diff natively,
 * so we use a plain fetch with the diff Accept header.
 */
export async function getPRDiff(octokit, owner, repo, prNumber) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${octokit._token}`,
        Accept: 'application/vnd.github.v3.diff',
        'User-Agent': 'pr-review-action',
      },
    }
  );
  if (!res.ok) throw new Error(`Failed to fetch diff: ${res.status}`);
  return res.text();
}

export async function getPRFiles(octokit, owner, repo, prNumber) {
  const { data } = await octokit.pulls.listFiles({
    owner, repo, pull_number: prNumber, per_page: 100,
  });
  return data.map(f => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
  }));
}

/**
 * Fetch full file content at a given ref.
 * Returns decoded string or null for binary/deleted/oversized files.
 */
export async function getFileContent(octokit, owner, repo, filePath, ref) {
  try {
    const { data } = await octokit.repos.getContent({
      owner, repo, path: filePath, ref,
    });
    if (Array.isArray(data)) return null; // directory
    if (data.encoding === 'base64' && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf8');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch full content for up to maxFiles most-changed non-deleted files.
 * Truncates each file to maxFileChars.
 */
export async function getFullFileContexts(octokit, owner, repo, files, headRef, maxFiles, maxFileChars) {
  const candidates = files
    .filter(f => f.status !== 'removed')
    .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
    .slice(0, maxFiles);

  const results = await Promise.all(
    candidates.map(async f => {
      const raw = await getFileContent(octokit, owner, repo, f.filename, headRef);
      if (!raw) return null;
      const truncated = raw.length > maxFileChars;
      return {
        path: f.filename,
        content: truncated ? raw.slice(0, maxFileChars) : raw,
        truncated,
        additions: f.additions,
        deletions: f.deletions,
      };
    })
  );
  return results.filter(Boolean);
}

/**
 * Fetch all comments on a PR: issue comments, inline review thread
 * comments, and review summaries — sorted oldest-first.
 */
export async function getPRComments(octokit, owner, repo, prNumber) {
  const [issueRes, reviewCommentsRes, reviewsRes] = await Promise.all([
    octokit.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 100 }),
    octokit.pulls.listReviewComments({ owner, repo, pull_number: prNumber, per_page: 100 }),
    octokit.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 100 }),
  ]);

  const all = [];

  for (const c of issueRes.data) {
    if (!c.body?.trim()) continue;
    all.push({ author: c.user.login, type: 'conversation', body: c.body.trim(), createdAt: c.created_at });
  }
  for (const c of reviewCommentsRes.data) {
    if (!c.body?.trim()) continue;
    all.push({
      author: c.user.login,
      type: 'inline',
      path: c.path,
      line: c.original_line || c.line,
      body: c.body.trim(),
      createdAt: c.created_at,
    });
  }
  for (const r of reviewsRes.data) {
    if (!r.body?.trim()) continue;
    all.push({
      author: r.user.login,
      type: 'review_summary',
      state: r.state,
      body: r.body.trim(),
      createdAt: r.submitted_at,
    });
  }

  all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return all;
}

export async function getExistingBotReviews(octokit, owner, repo, prNumber) {
  const { data } = await octokit.pulls.listReviews({
    owner, repo, pull_number: prNumber, per_page: 100,
  });
  return data;
}

export async function getAuthenticatedUser(octokit) {
  try {
    const { data } = await octokit.users.getAuthenticated();
    return data.login;
  } catch {
    // GitHub Actions token returns 403 for this endpoint — fall back to a
    // recognisable sentinel so detectReviewState still works via SHA markers
    return 'github-actions[bot]';
  }
}

export async function postComment(octokit, owner, repo, prNumber, body) {
  return octokit.issues.createComment({ owner, repo, issue_number: prNumber, body });
}

export async function postReview(octokit, owner, repo, prNumber, commitSha, comments, summaryBody) {
  return octokit.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    commit_id: commitSha,
    body: summaryBody,
    event: 'COMMENT',
    comments,
  });
}
