/**
 * Parse a unified diff and return a map of file → Set of added line numbers.
 * Only added lines (RIGHT side, starting with '+') are valid positions
 * for GitHub inline review comments.
 */
export function parseDiffLines(diff) {
  const fileLines = {};
  let currentFile = null;
  let lineNum = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6);
      fileLines[currentFile] = new Set();
    } else if (line.startsWith('@@ ')) {
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (m) lineNum = parseInt(m[1]) - 1;
    } else if (currentFile) {
      if (line.startsWith('+') || line.startsWith(' ')) {
        lineNum++;
        if (line.startsWith('+')) fileLines[currentFile].add(lineNum);
      }
      // lines starting with '-' don't advance the new-file line counter
    }
  }

  return fileLines;
}
