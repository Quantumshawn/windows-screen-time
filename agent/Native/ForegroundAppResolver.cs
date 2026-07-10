using System.Diagnostics;

namespace ScreenTime.Agent.Native;

internal readonly record struct ForegroundApp(string Exe, string DisplayName);

internal static class ForegroundAppResolver
{
    /// <summary>
    /// Resolves the process behind the current foreground window. Returns null when there is
    /// no usable foreground window (e.g. desktop focused) or the process can't be inspected.
    /// </summary>
    internal static ForegroundApp? GetForegroundApp()
    {
        IntPtr hwnd = NativeMethods.GetForegroundWindow();
        if (hwnd == IntPtr.Zero)
        {
            return null;
        }

        NativeMethods.GetWindowThreadProcessId(hwnd, out uint pid);
        if (pid == 0)
        {
            return null;
        }

        try
        {
            using var proc = Process.GetProcessById((int)pid);
            string exe = proc.ProcessName;
            string displayName = exe;

            try
            {
                string? fileDescription = proc.MainModule?.FileVersionInfo.FileDescription;
                if (!string.IsNullOrWhiteSpace(fileDescription))
                {
                    displayName = fileDescription!;
                }
            }
            catch
            {
                // Elevated/protected process: MainModule access denied. Fall back to exe name.
            }

            return new ForegroundApp(exe, displayName);
        }
        catch
        {
            // Process exited between the two calls, access denied, etc.
            return null;
        }
    }
}
