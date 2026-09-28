# eureka-judge

This repository contains a basic Python judge prototype and a demo-ready NestJS leaderboard API for the Eureka competitive programming platform.

## Judge prototype

The judge compiles and runs a submission in Docker with resource limits and no network access, then compares its output with the expected output. The current prototype handles one submission and one testcase at a time. Supported languages are C++, Python, and Java.

## Leaderboard API

The API lives in [`apps/api`](apps/api/README.md). It exposes `GET /api/contests/:contestId/leaderboard`, computes ICPC-style standings from completed contest submissions, persists a freeze snapshot, accepts a protected judge verdict callback, and emits WebSocket refresh events. The Python judge can report its verdict to the callback for an existing submission ID. Developers can run the API with Docker Compose without installing Node.js on the host computer. Run `scripts/demo-leaderboard.ps1` to run the judge and demonstrate the leaderboard changing from its actual verdict.

The demo API requires PostgreSQL and its Prisma schema. It is a small demonstration slice, not the full production platform; see the API README for setup and scope.
