# Kerma Security V2 - read-only local controller registration diagnostic.
# No controllers, cards, doors, configuration files or Windows services are changed.
# Run on the actual Windows Gateway host. Do not paste passwords/config JSON to chat.
param(
    [Parameter(Mandatory = $true)]
    [string]$GatewayRoot,
    [string]$TargetIp = '192.168.3.222',
    [string]$ExpectedName = '1-AC3'
)

$ErrorActionPreference = 'Stop'
Write-Host 'KERMA AC INVENTORY CHECK - READ ONLY'
Write-Host "Target: $ExpectedName @ $TargetIp"
Write-Host 'No commands are sent to any access-control doors.'

$path = Join-Path $GatewayRoot 'config\devices.json'
if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Write-Host 'LOCAL CONFIG: NOT FOUND at supplied GatewayRoot'
} else {
    try {
        $parsed = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
        $records = @()
        if ($parsed -is [array]) { $records = @($parsed) }
        elseif ($null -ne $parsed.devices) { $records = @($parsed.devices) }
        else { Write-Host 'LOCAL CONFIG: unexpected structure - inspect locally, do not paste contents' }
        $matches = @($records | Where-Object {
            ([string]$_.ip -eq $TargetIp) -or
            ([string]$_.name -eq $ExpectedName)
        })
        Write-Host "LOCAL CONFIG: $($matches.Count) matching entries"
        foreach ($entry in $matches) {
            $doorList = @($entry.doors | ForEach-Object { [string]$_ }) -join ','
            # Intentionally print only non-secret identity fields.
            Write-Host ("Device: id={0}; name={1}; ip={2}; role={3}; enabled={4}; doors=[{5}]" -f
                $entry.id, $entry.name, $entry.ip, $entry.role, $entry.enabled, $doorList)
        }
        if ($matches.Count -eq 0) {
            Write-Host 'NOT CONFIGURED LOCALLY: a cloud record cannot receive permissions yet.'
        }
        if ($matches.Count -gt 1) {
            Write-Host 'CONFLICT: stop and resolve ambiguous Gateway identity before provisioning.'
        }
    } catch {
        Write-Host 'LOCAL CONFIG: could not safely parse JSON. No files were modified.'
    }
}

try {
    $tcpReachable = Test-NetConnection -ComputerName $TargetIp -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue
    Write-Host "SDK TCP 8000 reachable: $tcpReachable"
} catch {
    Write-Host 'SDK TCP 8000 test failed (no controller changes made).'
}
Write-Host 'TCP 8000 reachable is not proof that HCNetSDK login, card programming or door permissions succeeded.'
