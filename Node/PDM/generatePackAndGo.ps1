# SolidWorks Pack & Go Automation Script
# Generates ZIP files for assemblies while preserving component positions
#
# Prerequisites:
# - SolidWorks installed (2020 or later recommended)
# - Run as Administrator (for COM access)
# - Input: assemblies.json from categorizeFiles.js
#
# Usage:
#   .\generatePackAndGo.ps1 -InputFile "assemblies.json" -OutputDir "PackAndGo"
#   .\generatePackAndGo.ps1 -InputFile "assemblies.json" -OutputDir "PackAndGo" -StartIndex 0 -Count 50

param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile,

    [Parameter(Mandatory=$true)]
    [string]$OutputDir,

    [int]$StartIndex = 0,
    [int]$Count = -1,  # -1 means all
    [switch]$IncludeDrawings,
    [switch]$FlattenFolders,
    [switch]$Verbose
)

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Load assembly list
Write-Host "Loading assemblies from: $InputFile"
$assemblies = Get-Content $InputFile | ConvertFrom-Json

$totalAssemblies = $assemblies.Count
Write-Host "Found $totalAssemblies assemblies"

# Calculate range
$endIndex = if ($Count -eq -1) { $totalAssemblies } else { [Math]::Min($StartIndex + $Count, $totalAssemblies) }
Write-Host "Processing assemblies $StartIndex to $($endIndex - 1)"

# Initialize SolidWorks
Write-Host "`nInitializing SolidWorks..."
try {
    $swApp = [System.Runtime.InteropServices.Marshal]::GetActiveObject("SldWorks.Application")
    Write-Host "Connected to running SolidWorks instance"
} catch {
    Write-Host "Starting new SolidWorks instance..."
    $swApp = New-Object -ComObject SldWorks.Application
    $swApp.Visible = $false  # Run hidden for batch processing
}

# Constants from SolidWorks API
$swDocASSEMBLY = 2
$swOpenDocOptions_Silent = 1

# Progress tracking
$processed = 0
$succeeded = 0
$failed = 0
$failedFiles = @()

# Log file
$logFile = Join-Path $OutputDir "packandgo_log.txt"
"Pack & Go Log - $(Get-Date)" | Out-File $logFile

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $Message" | Add-Content $logFile
    if ($Verbose) {
        Write-Host $Message
    }
}

# Process each assembly
for ($i = $StartIndex; $i -lt $endIndex; $i++) {
    $assembly = $assemblies[$i]
    $filename = $assembly.filename
    $filePath = $assembly.filePath
    $partNumber = $assembly.partNumber

    $processed++
    $progress = [math]::Round(($processed / ($endIndex - $StartIndex)) * 100, 1)

    Write-Host "`n[$processed/$($endIndex - $StartIndex)] ($progress%) Processing: $filename"
    Write-Log "Processing: $filename"

    # Check if file exists
    if (-not (Test-Path $filePath)) {
        Write-Host "  ERROR: File not found: $filePath" -ForegroundColor Red
        Write-Log "ERROR: File not found: $filePath"
        $failed++
        $failedFiles += @{ filename = $filename; error = "File not found" }
        continue
    }

    # Check if already processed
    $outputZip = Join-Path $OutputDir "$($partNumber).zip"
    if (Test-Path $outputZip) {
        Write-Host "  SKIP: Already exists: $outputZip" -ForegroundColor Yellow
        Write-Log "SKIP: Already exists: $outputZip"
        $succeeded++
        continue
    }

    try {
        # Open assembly in SolidWorks
        Write-Host "  Opening assembly..."
        $errors = 0
        $warnings = 0
        $doc = $swApp.OpenDoc6($filePath, $swDocASSEMBLY, $swOpenDocOptions_Silent, "", [ref]$errors, [ref]$warnings)

        if ($doc -eq $null) {
            throw "Failed to open document. Error code: $errors"
        }

        # Get Pack & Go interface
        Write-Host "  Creating Pack & Go..."
        $packAndGo = $doc.Extension.GetPackAndGo()

        if ($packAndGo -eq $null) {
            throw "Failed to get Pack & Go interface"
        }

        # Configure Pack & Go options
        $packAndGo.IncludeDrawings = $IncludeDrawings.IsPresent
        $packAndGo.IncludeSimulationResults = $false
        $packAndGo.IncludeToolboxComponents = $true
        $packAndGo.FlattenToSingleFolder = $FlattenFolders.IsPresent

        # Set output to ZIP file
        $packAndGo.SetSaveToName($true, $outputZip)

        # Get list of files to be included (for logging)
        $fileCount = 0
        $names = $null
        $statuses = $null
        $packAndGo.GetDocumentNames([ref]$names) | Out-Null
        if ($names) {
            $fileCount = $names.Count
        }
        Write-Host "  Files in assembly: $fileCount"
        Write-Log "Files in assembly: $fileCount"

        # Execute Pack & Go
        Write-Host "  Saving to: $outputZip"
        $result = $doc.Extension.SavePackAndGo($packAndGo)

        if ($result) {
            Write-Host "  SUCCESS" -ForegroundColor Green
            Write-Log "SUCCESS: $outputZip"
            $succeeded++
        } else {
            throw "SavePackAndGo returned false"
        }

        # Close document without saving
        $swApp.CloseDoc($doc.GetTitle())

    } catch {
        Write-Host "  FAILED: $_" -ForegroundColor Red
        Write-Log "FAILED: $filename - $_"
        $failed++
        $failedFiles += @{ filename = $filename; error = $_.ToString() }

        # Try to close any open document
        try {
            if ($doc) {
                $swApp.CloseDoc($doc.GetTitle())
            }
        } catch {}
    }

    # Small delay to prevent overwhelming SolidWorks
    Start-Sleep -Milliseconds 500
}

# Summary
Write-Host "`n" + "=" * 60
Write-Host "PACK & GO COMPLETE"
Write-Host "=" * 60
Write-Host "Processed: $processed"
Write-Host "Succeeded: $succeeded" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

if ($failedFiles.Count -gt 0) {
    Write-Host "`nFailed files:"
    $failedFiles | ForEach-Object {
        Write-Host "  - $($_.filename): $($_.error)" -ForegroundColor Red
    }

    # Save failed files list
    $failedLog = Join-Path $OutputDir "failed_assemblies.json"
    $failedFiles | ConvertTo-Json | Out-File $failedLog
    Write-Host "`nFailed files saved to: $failedLog"
}

Write-Host "`nLog file: $logFile"
Write-Host "Output directory: $OutputDir"

# Generate manifest for upload script
$manifest = @{
    generatedAt = (Get-Date).ToString("o")
    outputDir = $OutputDir
    totalProcessed = $processed
    succeeded = $succeeded
    failed = $failed
    files = @()
}

Get-ChildItem -Path $OutputDir -Filter "*.zip" | ForEach-Object {
    $manifest.files += @{
        filename = $_.Name
        path = $_.FullName
        size = $_.Length
        partNumber = $_.BaseName
    }
}

$manifestPath = Join-Path $OutputDir "manifest.json"
$manifest | ConvertTo-Json -Depth 3 | Out-File $manifestPath
Write-Host "Manifest saved to: $manifestPath"

Write-Host "`nNext step: Run uploadAssemblies.js with the manifest"
Write-Host "  node uploadAssemblies.js -i `"$manifestPath`" -f <folderId>"
