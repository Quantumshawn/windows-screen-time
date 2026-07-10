using Microsoft.Win32;

namespace ScreenTime.Agent.Config;

/// <summary>
/// Toggles launch-at-login via the per-user Run key (no admin rights needed, unlike a
/// machine-wide Run key or a scheduled task). Enabled state is judged by whether the
/// registered command line points at *this* running executable — if the exe was moved
/// since a previous Enable(), this correctly reports disabled rather than trusting a
/// stale path.
/// </summary>
public static class AutostartManager
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "ScreenTimeAgent";

    public static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
        var existing = key?.GetValue(ValueName) as string;
        return existing is not null && string.Equals(existing.Trim('"'), ExecutablePath, StringComparison.OrdinalIgnoreCase);
    }

    public static void Enable()
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true);
        key.SetValue(ValueName, $"\"{ExecutablePath}\"");
    }

    public static void Disable()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
        key?.DeleteValue(ValueName, throwOnMissingValue: false);
    }

    private static string ExecutablePath =>
        Environment.ProcessPath ?? throw new InvalidOperationException("Could not determine the current executable path.");
}
