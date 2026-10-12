# Read-only Kerma gateway audit. Does NOT change cards, faces, schedules or doors.
# Run from the Kerma-Gateway-Windows folder in PowerShell:
#   .\scripts\audit_gateway_windows.ps1 -CardNo 0008512258
# Or provide -Root "C:\path\to\Kerma-Gateway-Windows".
param(
    [string]$Root = (Get-Location).Path,
    [ValidatePattern('^\d{10}$')]
    [string]$CardNo = "0008512258"
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
Write-Host "=== KERMA GATEWAY READ-ONLY CHECK ==="
Write-Host "Root: $Root"
Write-Host "Date local: $([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz'))"
Write-Host "Node processes:"
Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path | Format-Table -AutoSize
foreach ($rel in @('src\isapi\client.ts', 'src\gateway\agent.ts', 'src\sync\engine.ts', 'dist\isapi\client.js', 'dist\gateway\agent.js', 'dist\sync\engine.js', 'dist\sdk\hcnetsdk.js')) {
    $p = Join-Path $Root $rel
    if (Test-Path -LiteralPath $p) {
        $file = Get-Item -LiteralPath $p
        Write-Host ("CODE FILE {0}: {1}" -f $rel, $file.LastWriteTime)
    } else {
        Write-Host ("CODE FILE {0}: MISSING" -f $rel)
    }
}
$db = Join-Path $Root 'data\kerma-gateway.db'
if (!(Test-Path -LiteralPath $db)) {
    Write-Warning "Gateway SQLite database not found. No records read."
    exit 0
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (!$node) {
    Write-Warning "Node.js not found; cannot inspect the local queue."
    exit 0
}
$js = @'
const { DatabaseSync } = require("node:sqlite");
const file = process.argv[1], card = process.argv[2];
const db = new DatabaseSync(file, {readOnly:true});
try {
  const cols = db.prepare("PRAGMA table_info(sync_jobs)").all().map(x=>x.name);
  const essential = ["device_id","kind","status","attempts","payload"];
  if (!essential.every(x=>cols.includes(x))) {
    console.log("SYNC JOB COLUMNS:", cols.join(", ")); process.exit(0);
  }
  const errors = cols.includes("last_error") ? "substr(last_error,1,130) as last_error" : "NULL as last_error";
  const time = cols.includes("created_at") ? "created_at" : "NULL as created_at";
  const sql = `SELECT device_id,kind,status,attempts,${errors},${time} FROM sync_jobs WHERE kind='card.upsert' AND payload LIKE ? ORDER BY rowid DESC LIMIT 20`;
  const rows = db.prepare(sql).all("%"+card+"%");
  console.log("CARD:",card);
  console.log("CARD SYNC JOBS:",JSON.stringify(rows,null,2));
  const summary = db.prepare("SELECT device_id,kind,status,count(*) as count FROM sync_jobs GROUP BY device_id,kind,status ORDER BY device_id,kind,status").all();
  console.log("ALL DEVICE QUEUE COUNTS (no credentials):",JSON.stringify(summary,null,2));
} finally { db.close(); }
'@
Write-Host "=== SQLITE SYNC QUEUE (READ ONLY) ==="
& $node.Source --no-warnings -e $js $db $CardNo
Write-Host "=== END: NO ACCESS CONFIGURATION CHANGED ==="
