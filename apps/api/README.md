# Eureka Leaderboard API Demo

This demo shows the core of the leaderboard API: ICPC-style scoring, a frozen standings snapshot, a protected judge-verdict callback, and a WebSocket refresh signal.

## Get standings

```http
GET /api/contests/:contestId/leaderboard?limit=50&cursor=<opaque-cursor>
```

The response includes contest state, rank, solved count, penalty minutes, and per-problem solve state. It ranks by solved count descending, then penalty ascending. Equal scores share competition rank; username orders tied rows for display. Wrong attempts count only for problems eventually solved. Compile errors and other judged non-AC verdicts count as wrong attempts; system errors do not.

The API reads contest, participant, problem, and completed-submission rows from PostgreSQL 16. Developers can run it without installing Node.js by using the included Docker setup. Install Docker Desktop, open a terminal at the repository root, and run:

```sh
docker compose -f infra/docker-compose.dev.yml up --build
```

The development compose file starts PostgreSQL, applies the Prisma schema, and runs the API with source changes mounted for reload. The database uses a named Docker volume, so its data remains between restarts. This is a local development setup; do not use its development database password for deployment. Private contests are denied until the identity module supplies its session and participant checks.

## Run the demo

With Docker Compose running, open a second PowerShell window at the repository root and run:

```powershell
.\scripts\demo-leaderboard.ps1
```

The script resets the sample rows, prints the initial standings, runs the repository's Python judge against `workspace/testcase1`, and reports the judge's actual result for Amara's seeded problem C submission. It then prints the recalculated standings. It builds the judge sandbox image if it is missing. This requires Python and Docker Desktop on the host, with the API Compose stack already running.

The sample contest ID is `e0000000-0000-4000-8000-000000000001`. You can also open `http://localhost:3000/api/contests/e0000000-0000-4000-8000-000000000001/leaderboard` to view the full JSON response.

The judge service can report a completed verdict with:

```http
POST /api/internal/submissions/:submissionId/verdict
X-Judge-Secret: <JUDGE_EVENT_SECRET>
Content-Type: application/json

{"verdict":"AC","runtimeMs":42,"memoryKb":8192}
```

The submission row must already exist; creating submissions belongs to the contest/submission API. The Python judge calls this endpoint when `run_judge` receives a `submission_id` and `JUDGE_EVENT_SECRET` is set. It defaults to `http://localhost:3000/api`; set `EUREKA_API_BASE_URL` if the judge runs elsewhere. The returned result includes a `callback.reported` flag, so API reporting failures are visible. The callback currently reports verdict and wall-clock runtime; memory usage is not measured. In local Compose the shared development secret is set in `infra/docker-compose.dev.yml`; replace it with a strong secret for any non-local environment.

The API also accepts Socket.IO clients. A client emits `leaderboard:subscribe` with `{ "contestId": "..." }` and receives `leaderboard:subscribed`. When an open contest verdict changes, the API emits `leaderboard:refresh` with the contest ID; clients should fetch the REST snapshot again. It does not send refresh events during the freeze window. The refresh signal works from this single API process.

## Demo scope

This version is intended to demonstrate the API behavior, not contest-day scale. It recalculates standings from PostgreSQL on each REST request. Redis caching/fanout, authentication, the real submission intake and judge queue, and load testing are outside this demo scope.

Freeze behavior is persisted on the first frozen-board read. The snapshot only includes submissions judged by `freezeTime`; submissions still being judged at the freeze cannot reveal later results on the frozen board. After `endTime`, the endpoint recomputes the unlocked standings from completed submissions.

This demo does not include Redis caching or fanout, multiple API instances, or submission creation from the contest platform.
