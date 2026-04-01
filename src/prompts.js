const MAX_DIFF_CHARS = 10000;

function langFromPath(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const map = { php: 'php', js: 'javascript', ts: 'typescript', vue: 'vue',
                jsx: 'jsx', tsx: 'tsx', css: 'css', scss: 'scss',
                json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
                sh: 'bash', env: 'bash' };
  return map[ext] || ext;
}

function buildFileContextBlock(fileContexts) {
  if (!fileContexts.length) return '*(no file content available)*';
  return fileContexts.map(f => {
    const lang = langFromPath(f.path);
    const note = f.truncated ? `\n// ... (truncated at ${f.content.length} chars)` : '';
    return `### ${f.path} (+${f.additions}/-${f.deletions})\n\`\`\`${lang}\n${f.content}${note}\n\`\`\``;
  }).join('\n\n');
}

/**
 * Initial review prompt — for PRs being reviewed for the first time.
 * AI receives full file contents + diff.
 */
export function buildInitialPrompt(pr, diff, files, fileContexts) {
  const fileList = files
    .map(f => `- ${f.filename} (+${f.additions}/-${f.deletions}) [${f.status}]`)
    .join('\n');

  const diffBlock = diff.length > MAX_DIFF_CHARS
    ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n... (diff truncated)'
    : diff;

  return `You are a senior Laravel developer doing a thorough code review.

You have been given:
1. The **full source** of each changed file as it exists after this PR — use this to understand the complete class structure, method contracts, and integration points.
2. The **diff** — to see exactly what was added or removed.

Review the **complete functionality**, not just the changed lines.

## PR Details
- Title: ${pr.title}
- Author: ${pr.user.login}
- Description: ${pr.body || '(no description)'}
- Branch: \`${pr.head.ref}\` → \`${pr.base.ref}\`
- Files changed: ${files.length}

## Changed Files
${fileList}

## Full File Contents (post-change)
${buildFileContextBlock(fileContexts)}

## Diff
\`\`\`diff
${diffBlock}
\`\`\`

## Review Checklist
Evaluate each changed file as a whole:

1. **Functional Correctness** — edge cases, null checks, wrong conditions, off-by-ones
2. **Code Quality** — readability, naming, duplication, dead code, cognitive complexity
3. **Laravel Patterns** — Eloquent, form requests, service providers, jobs, events, policies, observers, facades
4. **Security** — SQL injection, XSS, CSRF, mass assignment, auth/authz gaps, IDOR, sensitive data exposure
5. **Performance** — N+1 queries (look at full methods, not just changed lines!), missing eager loading, unnecessary DB calls in loops
6. **Architecture** — SRP violations, fat controllers, business logic in wrong layer, missing abstractions
7. **Error Handling** — missing try/catch, swallowed exceptions, wrong HTTP status codes
8. **API Contract** — input validation completeness, consistent response format

## Output
Return ONLY valid JSON, no other text:
\`\`\`json
{
  "summary": "2-4 sentences: what this PR does, what looks good, and the main concerns.",
  "verdict": "APPROVE | REQUEST_CHANGES | COMMENT",
  "functional_issues": ["Critical logic/correctness bugs that could cause real problems"],
  "inline_comments": [
    { "path": "app/Http/Controllers/SomeController.php", "line": 42, "comment": "Specific, actionable feedback." }
  ],
  "highlights": ["Key finding 1 (file: reason)", "Key finding 2", "Key finding 3"]
}
\`\`\`

Rules:
- inline_comments: max 10, only the most impactful issues
- Line numbers must correspond to ADDED lines (starting with +) in the diff
- functional_issues: only genuine bugs/security holes, not style preferences`;
}

/**
 * Re-review prompt — for PRs with a new commit pushed after prior feedback.
 * AI receives full file contents + new diff + complete conversation history.
 */
export function buildReReviewPrompt(pr, diff, files, fileContexts, prComments) {
  const fileList = files
    .map(f => `- ${f.filename} (+${f.additions}/-${f.deletions}) [${f.status}]`)
    .join('\n');

  const diffBlock = diff.length > MAX_DIFF_CHARS
    ? diff.slice(0, MAX_DIFF_CHARS) + '\n\n... (diff truncated)'
    : diff;

  const conversationBlock = prComments.length > 0
    ? prComments.map(c => {
        const loc = c.type === 'inline' ? ` [${c.path}:${c.line}]` : '';
        const body = c.body.length > 600 ? c.body.slice(0, 600) + '...' : c.body;
        return `[${c.type}] @${c.author}${loc}:\n${body}`;
      }).join('\n\n---\n\n')
    : '(no prior comments)';

  return `You are a senior Laravel developer doing a follow-up code review.

A new commit has been pushed to this PR after previous review feedback. You have:
1. The **full current source** of each changed file — the complete picture of where the code stands now.
2. The **new diff** — what specifically changed in this commit.
3. The **prior conversation** — all review comments and author replies.

Your job: assess what was fixed, what's still broken, and what's new — based on a full understanding of the code, not just the patch.

## PR Details
- Title: ${pr.title}
- Author: ${pr.user.login}
- Description: ${pr.body || '(no description)'}
- Branch: \`${pr.head.ref}\` → \`${pr.base.ref}\`
- Files changed: ${files.length}

## Changed Files
${fileList}

## Full File Contents (current state)
${buildFileContextBlock(fileContexts)}

## New Diff
\`\`\`diff
${diffBlock}
\`\`\`

## Prior Conversation (chronological)
${conversationBlock}

## Your Task
- Which previously raised issues are now **resolved**? (verify in the full file, not just the diff)
- Which issues are **still present** in the current code?
- Are there **new problems** introduced by this commit?
- Did the author ask questions or explain their decisions? **Answer them directly.**

## Output
Return ONLY valid JSON, no other text:
\`\`\`json
{
  "summary": "2-4 sentences: what changed, what's better, what still needs work. Acknowledge the author's effort.",
  "verdict": "APPROVE | REQUEST_CHANGES | COMMENT",
  "resolved_items": ["What was fixed and how"],
  "still_open": ["Issues still present in the current code"],
  "new_issues": ["New problems introduced by this commit"],
  "author_questions_answered": "Direct answer to author's questions/comments, or null if none",
  "inline_comments": [
    { "path": "app/Http/Controllers/SomeController.php", "line": 42, "comment": "Specific actionable feedback." }
  ],
  "highlights": ["Key finding 1", "Key finding 2", "Key finding 3"]
}
\`\`\`

Rules:
- inline_comments: max 10, focus on unresolved + new issues only
- Line numbers must correspond to ADDED lines (starting with +) in the new diff`;
}
