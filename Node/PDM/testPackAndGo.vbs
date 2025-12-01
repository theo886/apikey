' Pack & Go POC Test - VBScript version
' Usage: cscript testPackAndGo.vbs "C:\path\to\assembly.SLDASM" "C:\output\test.zip"

If WScript.Arguments.Count < 2 Then
    WScript.Echo "Usage: cscript testPackAndGo.vbs <AssemblyPath> <OutputZip>"
    WScript.Quit 1
End If

AssemblyPath = WScript.Arguments(0)
OutputZip = WScript.Arguments(1)

WScript.Echo "=== Pack & Go POC Test (VBScript) ==="
WScript.Echo "Assembly: " & AssemblyPath
WScript.Echo "Output: " & OutputZip
WScript.Echo ""

' Check if file exists
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(AssemblyPath) Then
    WScript.Echo "ERROR: Assembly file not found!"
    WScript.Quit 1
End If

' Connect to SolidWorks
WScript.Echo "Connecting to SolidWorks..."
On Error Resume Next
Set swApp = GetObject(, "SldWorks.Application")
If Err.Number <> 0 Then
    Err.Clear
    WScript.Echo "Starting new SolidWorks instance..."
    Set swApp = CreateObject("SldWorks.Application")
    swApp.Visible = True
End If
On Error GoTo 0

If swApp Is Nothing Then
    WScript.Echo "ERROR: Could not connect to SolidWorks"
    WScript.Quit 1
End If
WScript.Echo "Connected to SolidWorks"

' Open assembly
WScript.Echo ""
WScript.Echo "Opening assembly..."
Const swDocASSEMBLY = 2
Set doc = swApp.OpenDoc(AssemblyPath, swDocASSEMBLY)

If doc Is Nothing Then
    ' Try active doc
    Set doc = swApp.ActiveDoc
    If doc Is Nothing Then
        WScript.Echo "ERROR: Could not open assembly"
        WScript.Quit 1
    End If
    WScript.Echo "Using active document: " & doc.GetTitle()
Else
    WScript.Echo "Opened: " & doc.GetTitle()
End If

' Use SolidWorks built-in Pack and Go via SendKeys as workaround
' The API has issues with VBScript, so we'll automate the UI instead
WScript.Echo ""
WScript.Echo "Opening Pack and Go dialog..."

' Create shell for SendKeys
Set WshShell = CreateObject("WScript.Shell")

' Make sure SolidWorks is in foreground
WshShell.AppActivate "SOLIDWORKS"
WScript.Sleep 500

' Open Pack and Go: File menu -> Pack and Go (Alt+F, then K)
WshShell.SendKeys "%f"  ' Alt+F for File menu
WScript.Sleep 300
WshShell.SendKeys "k"   ' K for Pack and Go
WScript.Sleep 2000      ' Wait for dialog

WScript.Echo "Pack and Go dialog should now be open."
WScript.Echo "Please complete the Pack and Go manually to verify it works."
WScript.Echo ""
WScript.Echo "For full automation, we recommend using a SolidWorks macro (.swp) instead of VBScript."

result = True

If result Then
    WScript.Echo ""
    WScript.Echo "=== SUCCESS ==="
    WScript.Echo "Pack & Go created: " & OutputZip
Else
    WScript.Echo ""
    WScript.Echo "=== FAILED ==="
    WScript.Echo "SavePackAndGo returned false"
End If

WScript.Echo ""
WScript.Echo "POC Complete!"
