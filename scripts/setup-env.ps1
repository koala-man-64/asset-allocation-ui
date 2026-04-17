param(
    [string]$EnvFilePath = "",
    [switch]$DryRun,
    [string[]]$Set = @(),
    [string]$NpmrcPath = "",
    [string]$GitHubEnvironment = "prod"
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
    return @(Import-Csv -Path $Path | Where-Object { $_.template -eq "true" -and $_.github_storage -in @("var", "secret") })
}
function ConvertFrom-SecureStringPlain {
    param([Parameter(Mandatory = $true)][System.Security.SecureString]$Secure)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Normalize-EnvValue {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) { return "" }
    return $Value.Replace("`r", "").Replace("`n", "\n")
}
function Trim-TrailingLineBreaks {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) { return "" }
    return $Value.TrimEnd([char[]]@("`r", "`n"))
}
function Get-RepoSlug {
    param([string]$RepoName)
    $remote = Invoke-TextCommand -FilePath "git" -ArgumentList @("-C", $repoRoot, "config", "--get", "remote.origin.url")
    if ($remote -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(?:\.git)?$") {
        return "$($matches['owner'])/$RepoName"
    }
    return ""
}
function Get-CurrentRepoSlug {
    $remote = Invoke-TextCommand -FilePath "git" -ArgumentList @("-C", $repoRoot, "config", "--get", "remote.origin.url")
    if ($remote -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(?:\.git)?$") {
        return "$($matches['owner'])/$($matches['repo'])"
    }
    $slug = Invoke-TextCommand -FilePath "gh" -ArgumentList @("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner")
    return $slug.Trim()
}
function Get-RepoOwnerFromSlug {
    param([string]$RepoSlug)
    if ($RepoSlug -match "^(?<owner>[^/]+)/(?<repo>[^/]+)$") {
        return $matches['owner']
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
function Load-GitHubVariableMap {
    param(
        [string]$RepoSlug = "",
        [string]$EnvironmentName = ""
    )
    $map = @{}
    if ([string]::IsNullOrWhiteSpace($RepoSlug) -or -not (Test-CommandAvailable -Name "gh")) {
        return $map
    }
    $args = @("variable", "list", "--repo", $RepoSlug, "--json", "name,value")
    if (-not [string]::IsNullOrWhiteSpace($EnvironmentName)) {
        $args += @("--env", $EnvironmentName)
    }
    $items = Invoke-JsonCommand -FilePath "gh" -ArgumentList $args
    foreach ($item in @($items)) {
        if ($null -eq $item) { continue }
        if (-not ($item.PSObject.Properties.Name -contains "name")) { continue }
        $name = (($item.name | Out-String).Trim())
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $map[$name] = Normalize-EnvValue -Value (($item.value | Out-String).Trim())
    }
    return $map
}
function Load-GitHubOrganizationVariableMap {
    param([string]$Organization = "")
    $map = @{}
    if ([string]::IsNullOrWhiteSpace($Organization) -or -not (Test-CommandAvailable -Name "gh")) {
        return $map
    }
    $items = Invoke-JsonCommand -FilePath "gh" -ArgumentList @("variable", "list", "--org", $Organization, "--json", "name,value")
    foreach ($item in @($items)) {
        if ($null -eq $item) { continue }
        if (-not ($item.PSObject.Properties.Name -contains "name")) { continue }
        $name = (($item.name | Out-String).Trim())
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $map[$name] = Normalize-EnvValue -Value (($item.value | Out-String).Trim())
    }
    return $map
}
function Resolve-ReadableFilePath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $candidates = New-Object System.Collections.Generic.List[string]
    $candidates.Add($Path)
    if (-not [System.IO.Path]::IsPathRooted($Path)) {
        $candidates.Add((Join-Path $repoRoot $Path))
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw "File not found at path '$Path'."
}
function Read-SecretFileValue {
    param([Parameter(Mandatory = $true)][string]$Path)
    $resolvedPath = Resolve-ReadableFilePath -Path $Path
    $content = Get-Content -LiteralPath $resolvedPath -Raw
    return (Trim-TrailingLineBreaks -Value $content)
}

$overrideMap = @{}
foreach ($entry in $Set) {
    if ($entry -match "^([^=]+)=(.*)$") { $overrideMap[$matches[1].Trim()] = $matches[2] }
}
$existingMap = Parse-EnvFile -Path $EnvFilePath
$templateMap = Parse-EnvFile -Path $templatePath
$contractRows = Load-ContractRows -Path $contractPath
$currentRepoSlug = Get-CurrentRepoSlug
$currentRepoOwner = Get-RepoOwnerFromSlug -RepoSlug $currentRepoSlug
$githubRepoVarMap = Load-GitHubVariableMap -RepoSlug $currentRepoSlug
$githubEnvironmentVarMap = Load-GitHubVariableMap -RepoSlug $currentRepoSlug -EnvironmentName $GitHubEnvironment
$githubOrganizationVarMap = Load-GitHubOrganizationVariableMap -Organization $currentRepoOwner
$npmrcResolution = $null
if (-not [string]::IsNullOrWhiteSpace($NpmrcPath)) {
    $npmrcResolution = New-Resolution -Value (Read-SecretFileValue -Path $NpmrcPath) -Source "file"
}

function Resolve-GitHubVariableValue {
    param([string]$Key)
    if ($githubEnvironmentVarMap.ContainsKey($Key)) {
        $environmentSource = if ([string]::IsNullOrWhiteSpace($GitHubEnvironment)) { "github-env" } else { "github-env:$GitHubEnvironment" }
        return (New-Resolution -Value $githubEnvironmentVarMap[$Key] -Source $environmentSource)
    }
    if ($githubRepoVarMap.ContainsKey($Key)) {
        return (New-Resolution -Value $githubRepoVarMap[$Key] -Source "github")
    }
    if ($githubOrganizationVarMap.ContainsKey($Key)) {
        return (New-Resolution -Value $githubOrganizationVarMap[$Key] -Source "github-org")
    }
    return (New-Resolution)
}
function Resolve-DiscoveredValue {
    param([string]$Key)
    $githubResolution = Resolve-GitHubVariableValue -Key $Key
    if (-not [string]::IsNullOrWhiteSpace($githubResolution.Value)) {
        return $githubResolution
    }
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
                return (New-Resolution -Value $app.properties.configuration.ingress.fqdn -Source "azure")
            }
        }
        "API_UPSTREAM_SCHEME" {
            $app = Invoke-JsonCommand -FilePath "az" -ArgumentList @("containerapp", "show", "--name", "asset-allocation-api", "--resource-group", "AssetAllocationRG", "-o", "json")
            if ($app -and $app.properties.configuration.ingress.fqdn) {
                return (New-Resolution -Value "https" -Source "azure")
            }
            return (New-Resolution -Value "https" -Source "default")
        }
        "UI_AUTH_ENABLED" { return (New-Resolution -Value "true" -Source "default") }
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
function Prompt-SecretValue {
    param([string]$Name, [string]$Description = "")
    if ($Description) { Write-Host "# $Description" -ForegroundColor DarkGray }
    $secure = Read-Host "$Name [secret]" -AsSecureString
    return (ConvertFrom-SecureStringPlain -Secure $secure)
}
function Prompt-SecretFileValue {
    param([string]$Name, [string]$Description = "")
    if ($Description) { Write-Host "# $Description" -ForegroundColor DarkGray }
    $path = Read-Host "$Name file path"
    if ([string]::IsNullOrWhiteSpace($path)) { return "" }
    return (Read-SecretFileValue -Path $path)
}

$results = New-Object System.Collections.Generic.List[object]
foreach ($row in $contractRows) {
    $name = $row.name
    $description = (($row.notes | Out-String).Trim())
    $isSecret = $row.github_storage -eq "secret"
    $defaultValue = if ($templateMap.ContainsKey($name)) { Normalize-EnvValue -Value $templateMap[$name] } else { "" }

    if ($name -eq "NPMRC" -and $null -ne $npmrcResolution) {
        $results.Add([pscustomobject]@{ Name = $name; Value = $npmrcResolution.Value; Source = $npmrcResolution.Source; IsSecret = $true; PromptRequired = $false })
        continue
    }

    if ($existingMap.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($existingMap[$name])) {
        $results.Add([pscustomobject]@{ Name = $name; Value = (Normalize-EnvValue -Value $existingMap[$name]); Source = "existing"; IsSecret = $isSecret; PromptRequired = $false })
        continue
    }
    if ($overrideMap.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($overrideMap[$name])) {
        $results.Add([pscustomobject]@{ Name = $name; Value = (Normalize-EnvValue -Value $overrideMap[$name]); Source = "prompted"; IsSecret = $isSecret; PromptRequired = $false })
        continue
    }

    if (-not $isSecret) {
        $discovered = Resolve-DiscoveredValue -Key $name
        if (-not [string]::IsNullOrWhiteSpace($discovered.Value)) {
            $results.Add([pscustomobject]@{ Name = $name; Value = $discovered.Value; Source = $discovered.Source; IsSecret = $false; PromptRequired = $false })
            continue
        }
        if ($DryRun) {
            $results.Add([pscustomobject]@{ Name = $name; Value = $defaultValue; Source = "default"; IsSecret = $false; PromptRequired = $true })
            continue
        }
        $value = Prompt-PlainValue -Name $name -Suggestion $defaultValue -Description $description
        $source = if ([string]::IsNullOrWhiteSpace($value) -or $value -eq $defaultValue) { "default" } else { "prompted" }
        $results.Add([pscustomobject]@{ Name = $name; Value = (Normalize-EnvValue -Value $value); Source = $source; IsSecret = $false; PromptRequired = $false })
        continue
    }

    if ($DryRun) {
        $results.Add([pscustomobject]@{ Name = $name; Value = $defaultValue; Source = "default"; IsSecret = $true; PromptRequired = $true })
        continue
    }

    $secretValue = if ($name -eq "NPMRC") {
        Prompt-SecretFileValue -Name $name -Description $description
    } else {
        Prompt-SecretValue -Name $name -Description $description
    }
    $secretSource = if ([string]::IsNullOrWhiteSpace($secretValue)) {
        "default"
    } elseif ($name -eq "NPMRC") {
        "file"
    } else {
        "prompted"
    }
    $results.Add([pscustomobject]@{ Name = $name; Value = (Normalize-EnvValue -Value $secretValue); Source = $secretSource; IsSecret = $true; PromptRequired = $false })
}

$lines = foreach ($result in $results) { "{0}={1}" -f $result.Name, $result.Value }
Write-Host "Target env file: $EnvFilePath" -ForegroundColor Cyan
foreach ($result in $results) {
    $displayValue = if ($result.IsSecret -and -not [string]::IsNullOrWhiteSpace($result.Value)) { "<redacted>" } else { $result.Value }
    Write-Host ("{0}={1} [source={2}; prompt_required={3}]" -f $result.Name, $displayValue, $result.Source, $result.PromptRequired.ToString().ToLowerInvariant())
}
if ($DryRun) {
    Write-Host ""
    Write-Host "# Preview (.env.web)" -ForegroundColor Cyan
    foreach ($result in $results) {
        $displayValue = if ($result.IsSecret -and -not [string]::IsNullOrWhiteSpace($result.Value)) { "<redacted>" } else { $result.Value }
        Write-Host ("{0}={1}" -f $result.Name, $displayValue)
    }
    return
}
Set-Content -Path $EnvFilePath -Value $lines -Encoding utf8
Write-Host "Wrote $EnvFilePath" -ForegroundColor Green
