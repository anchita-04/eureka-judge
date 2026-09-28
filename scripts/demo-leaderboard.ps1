$ErrorActionPreference = 'Stop'

$contestId = 'e0000000-0000-4000-8000-000000000001'
$baseUrl = 'http://localhost:3000/api'
$composeFile = 'infra/docker-compose.dev.yml'
$env:EUREKA_API_BASE_URL = $baseUrl
$env:JUDGE_EVENT_SECRET = 'local-judge-secret-change-before-deploy'
$env:EUREKA_SUBMISSION_ID = 'e0000000-0000-4000-8000-000000000036' # Seeded Amara problem C submission

Write-Host 'Resetting the repeatable demo data...'
& docker compose -f $composeFile exec -T api pnpm db:seed
if ($LASTEXITCODE -ne 0) { throw 'Could not seed demo data. Is Docker Compose running?' }

$before = Invoke-RestMethod -Uri "$baseUrl/contests/$contestId/leaderboard"
Write-Host "`nStandings before the judge callback:"
$before.entries |
    Select-Object rank, username, problemsSolved, penaltyMinutes |
    Format-Table -AutoSize

& docker image inspect judge-sandbox:latest *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Building the judge sandbox image...'
    & docker build -f sandbox/dockerfile -t judge-sandbox:latest sandbox
    if ($LASTEXITCODE -ne 0) { throw 'Could not build the judge sandbox image.' }
}

Write-Host "`nRunning the actual Python judge and reporting its result to the API..."
& python test.py
if ($LASTEXITCODE -ne 0) { throw 'The Python judge did not complete successfully.' }

$after = Invoke-RestMethod -Uri "$baseUrl/contests/$contestId/leaderboard"
Write-Host "`nStandings after the judge callback:"
$after.entries |
    Select-Object rank, username, problemsSolved, penaltyMinutes |
    Format-Table -AutoSize

Write-Host "Full API response: $baseUrl/contests/$contestId/leaderboard"
