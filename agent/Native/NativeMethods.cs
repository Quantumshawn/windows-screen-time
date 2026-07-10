using System.Runtime.InteropServices;

namespace ScreenTime.Agent.Native;

[StructLayout(LayoutKind.Sequential)]
internal struct POINT
{
    public int X;
    public int Y;
}

[StructLayout(LayoutKind.Sequential)]
internal struct LASTINPUTINFO
{
    public uint cbSize;
    public uint dwTime;
}

internal static partial class NativeMethods
{
    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool GetCursorPos(out POINT lpPoint);

    [LibraryImport("user32.dll")]
    internal static partial IntPtr GetForegroundWindow();

    [LibraryImport("user32.dll")]
    internal static partial uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    /// <summary>
    /// Milliseconds since the last system-wide keyboard/mouse input, computed via unsigned
    /// 32-bit subtraction so it stays correct across the ~49.7-day GetTickCount wraparound.
    /// </summary>
    internal static uint GetIdleMilliseconds()
    {
        var lii = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref lii))
        {
            // API failure: fail toward "active" rather than falsely truncating a session.
            return 0;
        }

        uint currentTicks = unchecked((uint)Environment.TickCount);
        return unchecked(currentTicks - lii.dwTime);
    }

    internal static POINT ReadCursorPos()
    {
        return GetCursorPos(out var p) ? p : default;
    }
}
