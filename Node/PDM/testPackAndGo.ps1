# Quick Pack & Go POC - Test with a single assembly
#
# Usage:
#   .\testPackAndGo.ps1 -AssemblyPath "C:\Path\To\Assembly.SLDASM" -OutputZip "C:\Output\test.zip"
#
# Prerequisites:
# - SolidWorks installed
# - Run PowerShell as Administrator

param(
    [Parameter(Mandatory=$true)]
    [string]$AssemblyPath,

    [Parameter(Mandatory=$true)]
    [string]$OutputZip
)

Write-Host "=== Pack & Go POC Test ===" -ForegroundColor Cyan
Write-Host "Assembly: $AssemblyPath"
Write-Host "Output: $OutputZip"

# Check if file exists
if (-not (Test-Path $AssemblyPath)) {
    Write-Host "ERROR: Assembly file not found: $AssemblyPath" -ForegroundColor Red
    exit 1
}

# Initialize SolidWorks
Write-Host "`nInitializing SolidWorks..."
try {
    $swApp = [System.Runtime.InteropServices.Marshal]::GetActiveObject("SldWorks.Application")
    Write-Host "Connected to running SolidWorks instance" -ForegroundColor Green
} catch {
    Write-Host "Starting new SolidWorks instance..."
    $swApp = New-Object -ComObject SldWorks.Application
    $swApp.Visible = $true  # Keep visible for POC
}

# Constants
$swDocASSEMBLY = 2
$swOpenDocOptions_Silent = 1

# Open assembly
Write-Host "`nOpening assembly..."

# Try using OpenDoc (simpler method) first
try {
    $doc = $swApp.OpenDoc($AssemblyPath, $swDocASSEMBLY)
} catch {
    Write-Host "OpenDoc failed, trying ActiveDoc..." -ForegroundColor Yellow
    $doc = $null
}

# If OpenDoc failed, check if it's already open
if ($doc -eq $null) {
    $doc = $swApp.ActiveDoc
    if ($doc -ne $null) {
        Write-Host "Using already-open document: $($doc.GetTitle())" -ForegroundColor Yellow
    }
}

if ($doc -eq $null) {
    Write-Host "ERROR: Failed to open assembly. Make sure the file is accessible." -ForegroundColor Red
    Write-Host "Try opening the file manually in SolidWorks first, then run script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "Assembly opened successfully: $($doc.GetTitle())" -ForegroundColor Green

# Get Pack & Go interface
Write-Host "`nCreating Pack & Go..."
$packAndGo = $doc.Extension.GetPackAndGo()

if ($packAndGo -eq $null) {
    Write-Host "ERROR: Failed to get Pack & Go interface" -ForegroundColor Red
    $swApp.CloseDoc($doc.GetTitle())
    exit 1
}

# Configure Pack & Go
$packAndGo.IncludeDrawings = $false
$packAndGo.IncludeSimulationResults = $false
$packAndGo.IncludeToolboxComponents = $true
$packAndGo.FlattenToSingleFolder = $true

# Set output to ZIP
$packAndGo.SetSaveToName($true, $OutputZip)

# Get list of files to be included
$names = $null
$statuses = $null
$packAndGo.GetDocumentNames([ref]$names) | Out-Null

Write-Host "`nFiles to be included in Pack & Go:"
if ($names) {
    foreach ($name in $names) {
        Write-Host "  - $name"
    }
    Write-Host "Total: $($names.Count) files"
} else {
    Write-Host "  (Could not retrieve file list)"
}

# Execute Pack & Go
Write-Host "`nSaving Pack & Go to: $OutputZip"
$result = $doc.Extension.SavePackAndGo($packAndGo)

if ($result) {
    Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
    Write-Host "Pack & Go created: $OutputZip"

    # Show file size
    if (Test-Path $OutputZip) {
        $size = (Get-Item $OutputZip).Length / 1MB
        Write-Host "File size: $([math]::Round($size, 2)) MB"
    }
} else {
    Write-Host "`n=== FAILED ===" -ForegroundColor Red
    Write-Host "SavePackAndGo returned false"
}

# Close document
Write-Host "`nClosing assembly..."
$swApp.CloseDoc($doc.GetTitle())

Write-Host "`nPOC Complete!"
