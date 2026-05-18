param(
    [string[]]$Models,
    [ValidateSet('text', 'json', 'markdown')]
    [string]$Format = 'text',
    [string]$OutputJsonPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-ToGiB {
    param([string]$Raw)

    $s = ($Raw ?? '').Trim()
    if ($s -match '^([0-9]+(?:\.[0-9]+)?)\s*(GB|MB|TB)$') {
        $value = [double]$Matches[1]
        $unit = $Matches[2]
        switch ($unit) {
            'MB' { return $value / 1024.0 }
            'GB' { return $value }
            'TB' { return $value * 1024.0 }
        }
    }
    return 0.0
}

function Parse-OllamaList {
    $raw = & ollama list 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        throw 'Unable to run `ollama list`. Ensure Ollama is installed and running.'
    }

    $lines = $raw -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 }
    if ($lines.Count -lt 2) {
        throw 'No models found in `ollama list`.'
    }

    $models = @()
    foreach ($line in $lines | Select-Object -Skip 1) {
        $parts = $line -split '\s{2,}' | Where-Object { $_.Trim().Length -gt 0 }
        if ($parts.Count -lt 3) { continue }

        $name = $parts[0].Trim()
        $sizeText = $parts[2].Trim()
        $models += [pscustomobject]@{
            Name = $name
            SizeText = $sizeText
            SizeGiB = Convert-ToGiB -Raw $sizeText
        }
    }

    return $models
}

function Get-ModelContextLength {
    param([string]$Model)

    $raw = & ollama show $Model 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        return $null
    }

    foreach ($line in ($raw -split "`r?`n")) {
        if ($line -match 'context length\s+([0-9]+)') {
            return [int]$Matches[1]
        }
    }

    return $null
}

function Get-SystemBudget {
    $os = Get-CimInstance Win32_OperatingSystem
    $totalRamGiB = [math]::Round(($os.TotalVisibleMemorySize / 1024.0 / 1024.0), 1)
    $freeRamGiB = [math]::Round(($os.FreePhysicalMemory / 1024.0 / 1024.0), 1)

    $gpuControllers = Get-CimInstance Win32_VideoController
    $gpuVramGiB = 0.0
    foreach ($gpu in $gpuControllers) {
        if ($gpu.AdapterRAM -is [ValueType] -and [double]$gpu.AdapterRAM -gt 0) {
            $gpuVramGiB = [math]::Max($gpuVramGiB, [double]$gpu.AdapterRAM / 1GB)
        }
    }
    $gpuVramGiB = [math]::Round($gpuVramGiB, 1)

    return [pscustomobject]@{
        TotalRamGiB = $totalRamGiB
        FreeRamGiB = $freeRamGiB
        MaxGpuVramGiB = $gpuVramGiB
    }
}

function Round-ToContextStep {
    param([int]$Value)

    $steps = @(4096, 8192, 16384, 32768, 65536, 98304, 131072, 196608, 262144)
    foreach ($step in $steps) {
        if ($Value -le $step) {
            return $step
        }
    }
    return 262144
}

function Recommend-ContextWindow {
    param(
        [double]$ModelSizeGiB,
        [int]$MaxContext,
        [double]$FreeRamGiB,
        [double]$GpuVramGiB
    )

    $effectiveBudgetGiB = ($FreeRamGiB * 0.8) + ($GpuVramGiB * 0.9)

    $base = 8192
    if ($effectiveBudgetGiB -ge 16) { $base = 16384 }
    if ($effectiveBudgetGiB -ge 24) { $base = 32768 }
    if ($effectiveBudgetGiB -ge 36) { $base = 65536 }
    if ($effectiveBudgetGiB -ge 52) { $base = 98304 }
    if ($effectiveBudgetGiB -ge 68) { $base = 131072 }
    if ($effectiveBudgetGiB -ge 96) { $base = 196608 }

    $scale = 1.0
    if ($ModelSizeGiB -ge 15) { $scale = 0.60 }
    elseif ($ModelSizeGiB -ge 8) { $scale = 0.75 }
    elseif ($ModelSizeGiB -ge 5) { $scale = 0.85 }

    $recommended = [int]([math]::Floor($base * $scale))
    $recommended = [math]::Max(4096, $recommended)
    $recommended = Round-ToContextStep -Value $recommended
    $recommended = [math]::Min($recommended, $MaxContext)

    return $recommended
}

function Build-Result {
    param(
        [object[]]$ModelsInfo,
        [object]$SystemBudget
    )

    $rows = @()
    foreach ($m in $ModelsInfo) {
        $maxCtx = Get-ModelContextLength -Model $m.Name
        if (-not $maxCtx) { continue }

        $recommended = Recommend-ContextWindow `
            -ModelSizeGiB $m.SizeGiB `
            -MaxContext $maxCtx `
            -FreeRamGiB $SystemBudget.FreeRamGiB `
            -GpuVramGiB $SystemBudget.MaxGpuVramGiB

        $rows += [pscustomobject]@{
            model = $m.Name
            model_size_gib = [math]::Round($m.SizeGiB, 1)
            max_context = $maxCtx
            recommended_context = $recommended
            config_model_json_context_window = $recommended
        }
    }

    return $rows
}

$allModels = Parse-OllamaList
$selected = if ($Models -and $Models.Count -gt 0) {
    $set = New-Object System.Collections.Generic.HashSet[string] ([StringComparer]::OrdinalIgnoreCase)
    foreach ($name in $Models) { [void]$set.Add($name) }
    $allModels | Where-Object { $set.Contains($_.Name) }
} else {
    $allModels
}

if (-not $selected -or $selected.Count -eq 0) {
    throw 'No matching models found. Use `ollama list` to check installed model names.'
}

$budget = Get-SystemBudget
$resultRows = Build-Result -ModelsInfo $selected -SystemBudget $budget
if (-not $resultRows -or $resultRows.Count -eq 0) {
    throw 'Could not derive context lengths from `ollama show` for selected models.'
}

$output = [pscustomobject]@{
    generated_at = (Get-Date).ToString('s')
    host = [pscustomobject]@{
        total_ram_gib = $budget.TotalRamGiB
        free_ram_gib = $budget.FreeRamGiB
        max_gpu_vram_gib = $budget.MaxGpuVramGiB
    }
    models = $resultRows
}

if ($OutputJsonPath) {
    $dir = Split-Path -Parent $OutputJsonPath
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $output | ConvertTo-Json -Depth 6 | Set-Content -Path $OutputJsonPath -Encoding UTF8
}

switch ($Format) {
    'json' {
        $output | ConvertTo-Json -Depth 6
    }
    'markdown' {
        "# Local context-window recommendation"
        ""
        "- Total RAM (GiB): $($budget.TotalRamGiB)"
        "- Free RAM (GiB): $($budget.FreeRamGiB)"
        "- Max GPU VRAM (GiB): $($budget.MaxGpuVramGiB)"
        ""
        "| Model | Size (GiB) | Max context | Recommended context |"
        "|---|---:|---:|---:|"
        foreach ($row in $resultRows) {
            "| $($row.model) | $($row.model_size_gib) | $($row.max_context) | $($row.recommended_context) |"
        }
    }
    default {
        Write-Output "Host RAM total/free (GiB): $($budget.TotalRamGiB) / $($budget.FreeRamGiB)"
        Write-Output "Host max GPU VRAM (GiB): $($budget.MaxGpuVramGiB)"
        Write-Output ""
        foreach ($row in $resultRows) {
            Write-Output ("{0} => max:{1} recommended:{2}" -f $row.model, $row.max_context, $row.recommended_context)
        }
        Write-Output ""
        Write-Output "Use `recommended_context` as `context_window` in config/model.json for your local model entries."
    }
}
