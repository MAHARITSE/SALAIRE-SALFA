# Recherche volontairement limitee au sous-reseau IPv4 /24 de chaque carte privee.
$ErrorActionPreference = 'SilentlyContinue'
$path = 'salfa/'
function Test-Salfa([string]$base) {
    try {
        $base = $base.Trim().TrimEnd('/') + '/'
        $url = $base + 'api/index.php?action=health'
        $result = Invoke-RestMethod -Uri $url -TimeoutSec 2 -Method Get
        return $result.service -eq 'salfa-wamp-v1'
    } catch { return $false }
}
$found = New-Object System.Collections.Generic.List[string]
$cache = Join-Path $PSScriptRoot 'serveur.local.txt'
$known = @('http://127.0.0.1/salfa/')
if (Test-Path $cache) { $known += (Get-Content $cache -First 1) }
foreach ($address in $known) { if ($address -and (Test-Salfa $address) -and -not $found.Contains($address)) { $found.Add($address) } }
if ($found.Count -eq 0) {
    Write-Host 'Recherche du serveur SALFA sur le reseau local...'
    $addresses = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.PrefixLength -le 30 }
    $prefixes = @($addresses | ForEach-Object { $_.IPAddress -replace '\.\d+$','' } | Select-Object -Unique)
    $probes = @()
    foreach ($prefix in $prefixes) {
        foreach ($n in 1..254) {
            $ip = "$prefix.$n"; $client = New-Object System.Net.Sockets.TcpClient
            try { $pending = $client.BeginConnect($ip, 80, $null, $null); $probes += [PSCustomObject]@{Client=$client; Pending=$pending; IP=$ip} } catch { $client.Close() }
        }
    }
    Start-Sleep -Milliseconds 1500
    foreach ($probe in $probes) {
        try {
            if ($probe.Pending.IsCompleted -and $probe.Client.Connected) {
                $base = "http://$($probe.IP)/$path"
                if (Test-Salfa $base) { $found.Add($base) }
            }
        } finally { $probe.Client.Close() }
    }
}
if ($found.Count -gt 1) {
    for ($i=0; $i -lt $found.Count; $i++) { Write-Host "[$($i+1)] $($found[$i])" }
    $choice = Read-Host 'Numero du serveur'; $number = 0
    if (-not [int]::TryParse($choice, [ref]$number) -or $number -lt 1 -or $number -gt $found.Count) { Write-Host 'Choix invalide.'; exit 1 }
    $target = $found[$number-1]
} elseif ($found.Count -eq 1) { $target = $found[0] }
else {
    Write-Host 'Serveur non trouve automatiquement. Entrez son adresse complete (exemple : http://192.168.1.10/salfa/).'
    $target = Read-Host 'Adresse du serveur'
    if ($target -notmatch '^https?://[^/\s]+/salfa/?$' -or -not (Test-Salfa $target)) { Write-Host 'Serveur SALFA inaccessible ou adresse invalide.'; exit 1 }
}
$target = $target.TrimEnd('/') + '/'
Set-Content -Path $cache -Value $target -Encoding ASCII
Write-Host "Ouverture : $target"
Start-Process $target
