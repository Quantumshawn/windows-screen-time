using System.Globalization;

namespace ScreenTime.Agent.Logging;

/// <summary>
/// Console output alone disappears once the agent is autostarted with no attached console
/// (WinExe launched from the Run key), so every line also lands in a daily log file. Rotation
/// is by filename (one file per calendar day) rather than size, which keeps "what happened
/// on Tuesday" a single grep away; old files are pruned on startup rather than on a timer
/// since the agent only starts once a day in the common case anyway.
/// </summary>
public static class FileLogger
{
    private static readonly object Gate = new();
    private static string? _logDir;

    public static void Initialize(int retainDays = 14)
    {
        _logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ScreenTime", "logs");
        Directory.CreateDirectory(_logDir);
        PruneOldLogs(retainDays);
    }

    public static void Log(string message)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
        Console.WriteLine(line);

        if (_logDir is null)
        {
            return;
        }

        var path = Path.Combine(_logDir, $"agent-{DateTime.Now:yyyy-MM-dd}.log");
        lock (Gate)
        {
            File.AppendAllText(path, line + Environment.NewLine);
        }
    }

    private static void PruneOldLogs(int retainDays)
    {
        var cutoff = DateTime.Now.Date.AddDays(-retainDays);
        foreach (var file in Directory.EnumerateFiles(_logDir!, "agent-*.log"))
        {
            var stamp = Path.GetFileNameWithoutExtension(file)["agent-".Length..];
            if (DateTime.TryParseExact(stamp, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                && date < cutoff)
            {
                try
                {
                    File.Delete(file);
                }
                catch (IOException)
                {
                    // Best-effort cleanup — a locked/in-use file just gets retried next startup.
                }
            }
        }
    }
}
