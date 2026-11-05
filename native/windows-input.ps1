param([ValidateSet('capture', 'paste', 'session')][string]$Action, [long]$TargetWindow = 0)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VerbatimInput {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION data; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION {
    [FieldOffset(0)] public KEYBDINPUT keyboard;
    [FieldOffset(0)] public MOUSEINPUT mouse;
  }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
    public ushort key, scan; public uint flags, time; public UIntPtr extra;
  }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
    public int x, y; public uint data, flags, time; public UIntPtr extra;
  }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  public static void Paste() {
    ushort[] keys = { 0x11, 0x56, 0x56, 0x11 };
    INPUT[] inputs = new INPUT[4];
    for (int i=0; i<4; i++) {
      inputs[i].type = 1; inputs[i].data.keyboard.key = keys[i];
      inputs[i].data.keyboard.flags = i >= 2 ? 2u : 0u;
    }
    if (SendInput(4, inputs, Marshal.SizeOf(typeof(INPUT))) != 4)
      throw new Exception("Windows rejected the paste shortcut. Copy the transcript and paste it manually.");
  }
}
'@
if ($Action -eq 'session') {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $original = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -eq $original -or $original.Current.IsPassword) { throw 'This field cannot be tracked safely. Use Copy.' }
  $originalId = $original.GetRuntimeId() -join ':'
  try {
    $textPattern = $original.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    $ranges = $textPattern.GetSelection()
    if ($ranges.Length -ne 1) { throw 'Multiple selections are not supported.' }
    $originalRange = $ranges[0].Clone()
  } catch { throw 'This field does not expose a reliable text cursor. Use Copy.' }
  $window = [VerbatimInput]::GetForegroundWindow().ToInt64()
  Write-Output 'ready'
  $command = [Console]::ReadLine()
  if ($command -ne 'paste') { exit 0 }
  $current = [System.Windows.Automation.AutomationElement]::FocusedElement
  if ($null -eq $current -or ($current.GetRuntimeId() -join ':') -ne $originalId -or [VerbatimInput]::GetForegroundWindow().ToInt64() -ne $window) {
    throw 'The selected text field changed. Copy the transcript into the intended field.'
  }
  $ranges = $textPattern.GetSelection()
  $start = [System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start
  $end = [System.Windows.Automation.Text.TextPatternRangeEndpoint]::End
  if ($ranges.Length -ne 1 -or $ranges[0].CompareEndpoints($start, $originalRange, $start) -ne 0 -or $ranges[0].CompareEndpoints($end, $originalRange, $end) -ne 0) {
    throw 'The text cursor changed. Copy the transcript into the intended position.'
  }
  foreach ($key in @(0x10, 0x11, 0x12, 0x5B, 0x5C)) {
    if (([VerbatimInput]::GetAsyncKeyState($key) -band 0x8000) -ne 0) { throw 'Release modifier keys and paste the transcript manually.' }
  }
  if ($ranges[0].CompareEndpoints($start, $ranges[0], $end) -ne 0) {
    $insertion = $ranges[0].Clone()
    $insertion.MoveEndpointByRange($end, $insertion, $start)
    $insertion.Select()
    $preserved = $false
    for ($attempt = 0; $attempt -lt 20 -and -not $preserved; $attempt++) {
      Start-Sleep -Milliseconds 10
      $verified = $textPattern.GetSelection()
      $preserved = $verified.Length -eq 1 -and $verified[0].CompareEndpoints($start, $originalRange, $start) -eq 0 -and $verified[0].CompareEndpoints($start, $verified[0], $end) -eq 0
    }
    if (-not $preserved) { throw 'The selected text cannot be preserved safely. Use Copy.' }
  }

  [VerbatimInput]::Paste()
  exit 0
}
if ($Action -eq 'capture') { [VerbatimInput]::GetForegroundWindow().ToInt64(); exit 0 }
if ($TargetWindow -le 0 -or [VerbatimInput]::GetForegroundWindow().ToInt64() -ne $TargetWindow) {
  throw 'The active window changed. Copy your transcript and paste it into the intended field.'
}
foreach ($key in @(0x10, 0x11, 0x12, 0x5B, 0x5C)) {
  if (([VerbatimInput]::GetAsyncKeyState($key) -band 0x8000) -ne 0) {
    throw 'Release modifier keys and paste the copied transcript manually.'
  }
}
[VerbatimInput]::Paste()
