param(
    [string]$EnvFilePath = "",
    [switch]$DryRun,
    [string[]]$Set = @()
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFilePath)) {
    $EnvFilePath = Join-Path $repoRoot ".env.web"
}

$contractPath = Join-Path $repoRoot "docs\ops\env-contract.csv"
$templatePath = Join-Path $repoRoot ".env.template"

function Test-CommandAvailable { param([string]$Name) return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }
function Invoke-TextCommand {
    param([string]$FilePath, [string[]]$ArgumentList)
    if (-not (Test-CommandAvailable -Name $FilePath)) { return "" }
    try { return ((& $FilePath @ArgumentList 2>$null | Out-String).Trim()) } catch { return "" }
}
function Invoke-JsonCommand {
    param([string]$FilePath, [string[]]$ArgumentList)
    $text = Invoke-TextCommand -FilePath $FilePath -ArgumentList $ArgumentList
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    try { return $text | ConvertFrom-Json } catch { return $null }
}
function Parse-EnvFile {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    foreach ($rawLine in (Get-Content $Path)) {
        $line = $rawLine.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#") -or $line -notmatch "^([^=]+)=(.*)$") { continue }
        $map[$matches[1].Trim()] = $matches[2]
    }
    return $map
}
function Load-ContractRows {
    param([string]$Path)
    if (-not (Test-Path $Path)) { throw "Env contract not found at $Path" }
    return @(Import-Csv -Path $Path | Where-Object { $_.template -eq "true" -and $_.github_storage -eq "var" })
}
function Normalize-EnvValue {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) { return "" }
    return $Value.Replace("`r", "").Replace("`n", "\n")
}
function Get-RepoSlug {
    param([string]$RepoName)
    $remote = Invoke-TextCommand -FilePath "git" -ArgumentList @("-C", $repoRoot, "config", "--get", "remote.origin.url")
    if ($remote -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(?:\.git)?$") {
        return "$($matches['owner'])/$RepoName"
    }
    return ""
}
function Select-PreferredName {
    param($Items, [string]$Preferred, [string[]]$Contains = @())
    $list = @($Items)
    if ($list.Count -eq 0) { return "" }
    $exact = @($list | Where-Object { $_.name -eq $Preferred } | Select-Object -First 1)
    if ($exact.Count -gt 0) { return $exact[0].name }
    foreach ($needle in $Contains) {
        $match = @($list | Where-Object { $_.name -like "*$needle*" } | Select-Object -First 1)
        if ($match.Count -gt 0) { return $match[0].name }
    }
    return $Preferred
}
function New-Resolution {
    param([string]$Value = "", [string]$Source = "default", [bool]$PromptRequired = $false)
    return @{ Value = (Normalize-EnvValue -Value $Value); Source = $Source; PromptRequired = $PromptRequired }
}

$overrideMap = @{}
foreach ($entry in $Set) {
    if ($entry -match "^([^=]+)=(.*)$") { $overrideMap[$matches[1].Trim()] = $matches[2] }
}
$existingMap = Parse-EnvFile -Path $EnvFilePath
$templateMap = Parse-EnvFile -Path $templatePath
$contractRows = Load-ContractRows -Path $contractPath

function Resolve-DiscoveredValue {
    param([string]$Key)
    switch ($Key) {
        "AZURE_TENANT_ID" {
            $account = Invoke-JsonCommand -FilePath "az" -ArgumentList @("account", "show", "-o", "json")
            if ($account -and $account.tenantId) { return (New-Resolution -Value $account.tenantId -Source "azure") }
        }
        "AZURE_SUBSCRIPTION_ID" {
            $account = Invoke-JsonCommand -FilePath "az" -ArgumentList @("account", "show", "-o", "json")
            if ($account -and $account.id) { return (New-Resolution -Value $account.id -Source "azure") }
        }
        "RESOURCE_GROUP" { return (New-Resolution -Value "AssetAllocationRG" -Source "default") }
        "ACR_NAME" {
            $items = Invoke-JsonCommand -FilePath "az" -ArgumentList @("acr", "list", "--resource-group", "AssetAllocationRG", "-o", "json")
            if ($items) { return (New-Resolution -Value (Select-PreferredName -Items $items -Preferred "assetallocationacr" -Contains @("acr", "asset")) -Source "azure") }
        }
        "ACR_PULL_IDENTITY_NAME" {
            $items = Invoke-JsonCommand -FilePath "az" -ArgumentList @("identity", "list", "--resource-group", "AssetAllocationRG", "-o", "json")
            if ($items) { return (New-Resolution -Value (Select-PreferredName -Items $items -Preferred "asset-allocation-acr-pull-mi" -Contains @("acr", "pull")) -Source "azure") }
        }
        "CONTAINER_APPS_ENVIRONMENT_NAME" {
            $items = Invoke-JsonCommand -FilePath "az" -ArgumentList @("containerapp", "env", "list", "--resource-group", "AssetAllocationRG", "-o", "json")
            if ($items) { return (New-Resolution -Value (Select-PreferredName -Items $items -Preferred "asset-allocation-env" -Contains @("asset", "env")) -Source "azure") }
        }
        "SERVICE_ACCOUNT_NAME" {
            $items = Invoke-JsonCommand -FilePath "az" -ArgumentList @("identity", "list", "--resource-group", "AssetAllocationRG", "-o", "json")
            if ($items) { return (New-Resolution -Value (Select-PreferredName -Items $items -Preferred "asset-allocation-sa" -Contains @("service", "sa")) -Source "azure") }
        }
        "UI_APP_NAME" {
            $items = Invoke-JsonCommand -FilePath "az" -ArgumentList @("containerapp", "list", "--resource-group", "AssetAllocationRG", "-o", "json")
            if ($items) { return (New-Resolution -Value (Select-PreferredName -Items $items -Preferred "asset-allocation-ui" -Contains @("ui")) -Source "azure") }
        }
        "CONTRACTS_REPOSITORY" {
            $slug = Get-RepoSlug -RepoName "asset-allocation-contracts"
            if ($slug) { return (New-Resolution -Value $slug -Source "git") }
        }
        "API_UPSTREAM" {
            $app = Invoke-JsonCommand -FilePath "az" -ArgumentList @("containerapp", "show", "--name", "asset-allocation-api", "--resource-group", "AssetAllocationRG", "-o", "json")
            if ($app -and $app.properties.configuration.ingress.fqdn) {
                return (New-Resolution -Value "https://$($app.properties.configuration.ingress.fqdn)" -Source "azure")
            }
        }
        "AZURE_CLIENT_ID" {
            $items = Invoke-JsonCommand -FilePath "az" -ArgumentList @("identity", "list", "--resource-group", "AssetAllocationRG", "-o", "json")
            if ($items) {
                $candidate = @(@($items) | Where-Object { $_.name -like "*ui*" -or $_.name -like "*github*" -or $_.name -like "*gha*" } | Select-Object -First 1)
                if ($candidate.Count -gt 0 -and $candidate[0].clientId) { return (New-Resolution -Value $candidate[0].clientId -Source "azure") }
            }
        }
    }
    return (New-Resolution)
}

function Prompt-PlainValue {
    param([string]$Name, [string]$Suggestion = "", [string]$Description = "")
    if ($Description) { Write-Host "# $Description" -ForegroundColor DarkGray }
    $input = Read-Host "$Name [$Suggestion]"
    if ([string]::IsNullOrWhiteSpace($input)) { return $Suggestion }
    return $input
}

$results = New-Object System.Collections.Generic.List[object]
foreach ($row in $contractRows) {
    $name = $row.name
    $description = (($row.notes | Out-String).Trim())
    $defaultValue = if ($templateMap.ContainsKey($name)) { Normalize-EnvValue -Value $templateMap[$name] } else { "" }

    if ($existingMap.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($existingMap[$name])) {
        $results.Add([pscustomobject]@{ Name = $name; Value = (Normalize-EnvValue -Value $existingMap[$name]); Source = "existing"; PromptRequired = $false })
        continue
    }
    if ($overrideMap.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($overrideMap[$name])) {
        $results.Add([pscustomobject]@{ Name = $name; Value = (Normalize-EnvValue -Value $overrideMap[$name]); Source = "prompted"; PromptRequired = $false })
        continue
    }

    $discovered = Resolve-DiscoveredValue -Key $name
    if (-not [string]::IsNullOrWhiteSpace($discovered.Value)) {
        $results.Add([pscustomobject]@{ Name = $name; Value = $discovered.Value; Source = $discovered.Source; PromptRequired = $false })
        continue
    }

    if ($DryRun) {
        $results.Add([pscustomobject]@{ Name = $name; Value = $defaultValue; Source = "default"; PromptRequired = $true })
        continue
    }

    $value = Prompt-PlainValue -Name $name -Suggestion $defaultValue -Description $description
    $source = if ([string]::IsNullOrWhiteSpace($value) -or $value -eq $defaultValue) { "default" } else { "prompted" }
    $results.Add([pscustomobject]@{ Name = $name; Value = (Normalize-EnvValue -Value $value); Source = $source; PromptRequired = $false })
}

$lines = foreach ($result in $results) { "{0}={1}" -f $result.Name, $result.Value }
Write-Host "Target env file: $EnvFilePath" -ForegroundColor Cyan
foreach ($result in $results) {
    Write-Host ("{0}={1} [source={2}; prompt_required={3}]" -f $result.Name, $result.Value, $result.Source, $result.PromptRequired.ToString().ToLowerInvariant())
}
if ($DryRun) {
    Write-Host ""
    Write-Host "# Preview (.env.web)" -ForegroundColor Cyan
    foreach ($result in $results) {
        Write-Host ("{0}={1}" -f $result.Name, $result.Value)
    }
    return
}
Set-Content -Path $EnvFilePath -Value $lines -Encoding utf8
Write-Host "Wrote $EnvFilePath" -ForegroundColor Green
