# Waits for the DeckSift API to answer GET /api/health.
#
# Exit 0  = the API reported success:true (which requires a reachable DB).
# Exit 1  = never became healthy within the timeout (server up but half-broken,
#           DB down, or nothing started at all).
#
# Used by scripts/start-server.cmd after launching the server in the
# background, so a startup failure is reported cleanly instead of leaving a
# silently half-up process running.

param(
  # 127.0.0.1 (not localhost): the server binds 0.0.0.0 (IPv4 only), and on
  # Windows `localhost` can resolve to ::1 first, which never connects.
  [string]$Url = "http://127.0.0.1:3001/api/health",
  [int]$TimeoutSeconds = 30,
  [int]$IntervalSeconds = 1
)

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$attempts = 0

while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-RestMethod -Uri $Url -TimeoutSec 2 -ErrorAction Stop
    if ($response.success) {
      $elapsed = $attempts * $IntervalSeconds
      Write-Host "[DeckSift] API is healthy after ${elapsed}s."
      exit 0
    }
  } catch {
    # Not up yet (connection refused, 503 from a failing DB check, ...) —
    # keep polling until the deadline.
  }
  $attempts++
  Start-Sleep -Seconds $IntervalSeconds
}

Write-Host "[DeckSift] API did not become healthy within ${TimeoutSeconds}s. Check server.log for startup errors."
exit 1
