# Security detection benchmark

Measures the data-flow analysis on intentionally vulnerable applications, each pinned to a commit in [targets.json](targets.json). Only SQL, command, code-execution and SSRF findings are counted, and test code is skipped, the same as the security-rule scan in the extension.

```sh
npm run benchmark:security            # build, clone the targets (cached in the OS temp folder) and compare
node scripts/benchmark-security.mjs --update   # add new findings to the expected files as "unreviewed"
```

Each `expected/<target>.json` lists:

- `findings`: every finding the analysis reports, labeled `tp` (a real vulnerability) or `fp` (a false positive) with a note on why.
- `misses`: known vulnerabilities the analysis does not report, with the reason.

The run fails when a true positive disappears or a finding has no label. A removed false positive or a newly found miss is reported so the expected file can be updated. Label findings by reading the code, never by accepting the current output.
