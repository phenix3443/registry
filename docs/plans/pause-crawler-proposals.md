# Pause automated catalog proposals

Status: proposed. Requirement: [#5](https://github.com/phenix3443/registry/issues/5). Implementation: [#6](https://github.com/phenix3443/registry/issues/6), after this plan is reviewed and merged.

## Why

The catalog crawler is outside the current Agent Store scope (global Skills/MCP management). Each day at 04:00 UTC, `.github/workflows/crawl-pr.yml` force-pushes `crawler/new-packages`. Each push starts a `Validate manifests` run on PR #1 that ends in `action_required`, and the shared PR watcher counts that as a failure and dispatches work.

`action_required` is not a failed validation. It is GitHub's approval gate: the run is waiting for a maintainer and no job has executed. Nobody should approve these runs as part of this change, and the conclusion says nothing about the manifests in PR #1.

## Change

| File | Change |
| --- | --- |
| `.github/workflows/crawl-pr.yml` | Remove `schedule`. Keep `workflow_dispatch`. Correct the "Runs daily" header comment. Leave the jobs as they are. |
| `README.md` | Replace "proposed automatically" with: proposals run only when a maintainer dispatches the crawler. |

## Order of operations

1. Open the workflow PR. `Validate manifests` must pass on it.
2. After independent review, confirm the PR head is the reviewed SHA, then squash-merge with `[skip ci]` in the merge commit subject (see [Avoiding a store sync](#avoiding-a-store-sync)).
3. Run the [default-branch checks](#checks). Confirm no `crawl-pr.yml` run is queued or in progress:
   `gh run list --repo phenix3443/registry --workflow crawl-pr.yml --status queued` and the same with `--status in_progress`.
4. The executor closes PR #1 without merging and without deleting its branch:
   `gh pr close 1 --repo phenix3443/registry --comment "Crawler proposals are paused, see #5. Closed without publishing these manifests."`
5. The independent reviewer verifies the final state with the checks below.

The merge comes first because the schedule would otherwise keep running: the next cron run would push `crawler/new-packages` again and open a new proposal PR.

## Avoiding a store sync

`.github/workflows/sync.yml` runs on every push to `main` with no path filter. `scripts/sync.ts` re-publishes every manifest on `main`, and its upsert sets `status` back to `published`, including items that `scripts/review.ts` had quarantined. A documentation or workflow merge would therefore write to the store, and this work does not authorize publication.

GitHub skips push-triggered workflows when the commit message contains `[skip ci]`, so both merges (this plan and #6) use it:

```bash
gh pr merge <n> --repo phenix3443/registry --squash --subject "<title> (#<n>) [skip ci]"
```

Do not put `[skip ci]` in a commit on the PR branch, because it would also skip the PR's `Validate manifests` run. This skips the push-triggered validation on `main` too, which is acceptable because neither merge changes a manifest and the same check has passed on the PR.

If a `Sync to store` run starts anyway, do not continue to step 4. Record the run URL and hand the task back to its owner.

## Checks

Verify configuration and PR state directly. No day-long observation is needed, and manual dispatch must not be exercised, because that would be a crawl run.

```bash
R=phenix3443/registry
gh api "repos/$R/contents/.github/workflows/crawl-pr.yml?ref=main" \
  -H 'Accept: application/vnd.github.raw' > "$TMPDIR/crawl-pr.yml"
```

| Claim | Command | Pass |
| --- | --- | --- |
| No schedule on the default branch | `yq -e '.on \| has("schedule") \| not' "$TMPDIR/crawl-pr.yml"` | prints `true`, exit 0 |
| Manual dispatch remains | `yq -e '.on \| has("workflow_dispatch")' "$TMPDIR/crawl-pr.yml"` | prints `true`, exit 0 |
| Workflow is not disabled | `gh api repos/$R/actions/workflows/crawl-pr.yml --jq .state` | `active` |
| PR #1 closed without merge | `gh pr view 1 --repo $R --json state,mergedAt,mergeCommit` | `CLOSED`, both others `null` |
| Merge contains only the planned files | `gh api repos/$R/commits/<merge-sha> --jq '.files[].filename'` | the two files above, no `mcp/`, `skill/` or `provider/` path |
| Nothing ran on the merge commit | `gh run list --repo $R --commit <merge-sha>` | empty, so no sync and no crawl |
| Merged content is the reviewed content | `gh pr view <n> --repo $R --json headRefOid` | equals the reviewed SHA |

On the pre-change `main`, the first check exits 1 and the second exits 0, so the checks do distinguish the two states.

## Out of scope

- Changing the shared watcher (`github_watch.py`, `pr_activity.py`).
- Publishing, merging or editing any manifest, and running the crawler.
- Deleting crawler code, `crawler/new-packages`, or the workflow file.
- Changing how `sync.ts` treats quarantined items. Every other push to `main` still has that effect, so it needs its own issue.
- PR #2, which is a human contribution.

## Resuming

Resume only through a new reviewed issue and PR that restores the schedule, and only when all of these hold:

- The Agent Store scope includes crawled catalog packages again, and that decision is recorded on the issue.
- Bot proposals have a defined route past the `action_required` gate, so a scheduled push no longer produces a failure dispatch.
- Someone is named to review the proposal PRs.

A one-off `workflow_dispatch` stays available in the meantime as a deliberate maintainer action. It runs the crawler and opens a new proposal PR from `crawler/new-packages`. It does not need this plan changed, but it is not authorized by this work. Do not reopen PR #1: a resumed crawler should propose from a fresh crawl.

To undo the pause, revert the workflow change.
