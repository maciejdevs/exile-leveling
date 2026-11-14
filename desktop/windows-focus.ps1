# This helper only queries foreground-window ownership and executable locations.
# It never opens game memory, installs hooks, sends input, or changes any window.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ForegroundWindow {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    public static uint ProcessId() {
        uint processId;
        GetWindowThreadProcessId(GetForegroundWindow(), out processId);
        return processId;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref int length);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);
    public static string ExecutablePath(int processId) {
        // QUERY_LIMITED_INFORMATION only: no process-memory read/write rights.
        IntPtr process = OpenProcess(0x1000, false, processId);
        if (process == IntPtr.Zero) return null;
        try {
            StringBuilder path = new StringBuilder(32768);
            int length = path.Capacity;
            return QueryFullProcessImageName(process, 0, path, ref length) ? path.ToString() : null;
        } finally { CloseHandle(process); }
    }
}
'@

$gameNames = @('PathOfExile', 'PathOfExile_x64', 'PathOfExileSteam', 'PathOfExile_x64Steam', 'PathOfExileEGS')
$lastScan = [DateTime]::MinValue
$gameIds = @()
$directories = @()
$lastMessage = ''
while ($true) {
    if (([DateTime]::UtcNow - $lastScan).TotalSeconds -ge 3) {
        # Exit even if the desktop process was forcibly closed before cleanup.
        if (-not (Get-Process -Id $overlayProcessId -ErrorAction SilentlyContinue)) { break }
        $games = @(Get-Process -Name $gameNames -ErrorAction SilentlyContinue)
        $gameIds = @($games | ForEach-Object { $_.Id })
        $directories = @($games | ForEach-Object {
            $executable = [ForegroundWindow]::ExecutablePath($_.Id)
            if ($executable) { [System.IO.Path]::GetDirectoryName($executable) }
        } | Select-Object -Unique)
        $lastScan = [DateTime]::UtcNow
    }
    $foregroundId = [ForegroundWindow]::ProcessId()
    $kind = 'other'
    if ($foregroundId -eq $overlayProcessId) { $kind = 'overlay' }
    elseif ($gameIds -contains $foregroundId) { $kind = 'game' }
    $message = @{ foreground = $kind; directories = $directories } | ConvertTo-Json -Compress
    if ($message -ne $lastMessage) {
        [Console]::WriteLine($message)
        [Console]::Out.Flush()
        $lastMessage = $message
    }
    Start-Sleep -Milliseconds 200
}
