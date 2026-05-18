param(
    [string]$ProfilePath = ".\scripts\ollama-context-profiles.json",
    [switch]$Strict
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    throw 'Ollama command not found in PATH.'
}

if (-not (Test-Path $ProfilePath)) {
    throw "Profile file not found: $ProfilePath"
}

$profileData = Get-Content -Raw -Path $ProfilePath | ConvertFrom-Json
if (-not $profileData.profiles -or $profileData.profiles.Count -eq 0) {
    throw 'No profiles found in JSON file.'
}

$hasIssues = $false

foreach ($p in $profileData.profiles) {
    $aliasModel = [string]$p.alias_model
    $expectedCtx = [int]$p.num_ctx

    $raw = & ollama show $aliasModel 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        Write-Output "[missing] $aliasModel (expected num_ctx=$expectedCtx)"
        $hasIssues = $true
        continue
    }

    $actualCtx = $null
    foreach ($line in ($raw -split "`r?`n")) {
        if ($line -match 'context length\s+([0-9]+)') {
            $actualCtx = [int]$Matches[1]
            break
        }
    }

    if (-not $actualCtx) {
        Write-Output "[unknown] $aliasModel (unable to parse context length, expected $expectedCtx)"
        $hasIssues = $true
        continue
    }

    if ($actualCtx -eq $expectedCtx) {
        Write-Output "[ok] $aliasModel context=$actualCtx"
    } else {
        Write-Output "[mismatch] $aliasModel context=$actualCtx expected=$expectedCtx"
        $hasIssues = $true
    }
}

if ($Strict -and $hasIssues) {
    throw 'Profile verification failed in strict mode.'
}
