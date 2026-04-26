param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env.web"
$contractPath = Join-Path $repoRoot "docs\ops\env-contract.csv"

function Normalize-TextValue {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) { return "" }
    return $Value.Replace([string][char]0xFEFF, "").Trim()
}

function Parse-EnvFile {
    param([string]$Path)
    $map = @{}
    foreach ($rawLine in (Get-Content $Path)) {
        $line = Normalize-TextValue -Value $rawLine
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#") -or $line -notmatch "^([^=]+)=(.*)$") { continue }
        $map[(Normalize-TextValue -Value $matches[1])] = (Normalize-TextValue -Value $matches[2])
    }
    return $map
}
function ConvertTo-GitHubSecretValue {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) { return "" }
    return (Normalize-TextValue -Value $Value).Replace("\n", "`n")
}

function Load-EnvContract {
    param([string]$Path)
    if (-not (Test-Path $Path)) { throw "Env contract not found at $Path" }
    $map = @{}
    foreach ($row in (Import-Csv -Path $Path)) {
        $name = (($row.name | Out-String).Trim())
        if ($name) { $map[$name] = $row }
    }
    return $map
}

if (-not (Test-Path $envPath)) { throw ".env.web not found at $envPath. Run scripts/setup-env.ps1 first." }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI (gh) is required to sync vars and secrets." }

$envMap = Parse-EnvFile -Path $envPath
$contractMap = Load-EnvContract -Path $contractPath
$undocumented = @($envMap.Keys | Where-Object { -not $contractMap.ContainsKey($_) } | Sort-Object -Unique)
if ($undocumented.Count -gt 0) { throw ".env.web contains undocumented keys: $($undocumented -join ', ')" }

$expectedVars = New-Object System.Collections.Generic.List[string]
$expectedSecrets = New-Object System.Collections.Generic.List[string]
foreach ($key in ($contractMap.Keys | Sort-Object)) {
    $entry = $contractMap[$key]
    $storage = (($entry.github_storage | Out-String).Trim()).ToLowerInvariant()
    if ($storage -notin @("var", "secret")) { continue }
    $value = if ($envMap.ContainsKey($key)) { $envMap[$key] } else { "" }
    if ($storage -eq "var") { $expectedVars.Add($key) } else { $expectedSecrets.Add($key) }
    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-Host "Skipping empty ${storage}: $key" -ForegroundColor Yellow
        continue
    }
    if ($DryRun) {
        Write-Host "[DRY RUN] Would set ${storage}: $key"
        continue
    }
    if ($storage -eq "var") {
        gh variable set $key --body $value
    } else {
        gh secret set $key --body (ConvertTo-GitHubSecretValue -Value $value)
    }
    Write-Host "Synced ${storage}: $key" -ForegroundColor Green
}

function Remove-UnexpectedItems {
    param([string]$Kind, [string[]]$Expected)
    $remote = @(gh $Kind list --json name --jq ".[].name" 2>$null)
    $unexpected = @($remote | Where-Object { $_ -and $_ -notin $Expected } | Sort-Object -Unique)
    foreach ($name in $unexpected) {
        if ($DryRun) {
            Write-Host "[DRY RUN] Would delete unexpected ${Kind}: $name"
            continue
        }
        gh $Kind delete $name
        Write-Host "Deleted unexpected ${Kind}: $name" -ForegroundColor Yellow
    }
}

Remove-UnexpectedItems -Kind "variable" -Expected $expectedVars.ToArray()
Remove-UnexpectedItems -Kind "secret" -Expected $expectedSecrets.ToArray()
