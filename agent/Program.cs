using System.Globalization;
using Microsoft.Win32;
using ScreenTime.Agent.Config;
using ScreenTime.Agent.Storage;
using ScreenTime.Agent.Tracking;
using ScreenTime.Agent.Upload;

var config = AgentConfig.LoadOrCreate();

var queueDbPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
    "ScreenTime", "queue.db");
using var store = new SliceQueueStore(queueDbPath);

var recovered = store.CloseOrphanedOpenSlices();
if (recovered > 0)
{
    Log($"Recovered {recovered} open slice(s) left over from a previous run (crash or force-kill).");
}

SliceUploader? uploader = null;
if (!string.IsNullOrWhiteSpace(config.ApiUrl) && !string.IsNullOrWhiteSpace(config.DeviceToken))
{
    uploader = new SliceUploader(
        http: new HttpClient(),
        apiUrl: config.ApiUrl,
        deviceToken: config.DeviceToken,
        deviceId: config.DeviceId,
        healthyInterval: TimeSpan.FromSeconds(config.UploadIntervalSec));
}
else
{
    Log("No ApiUrl/DeviceToken configured — running offline-only (local queue will grow until configured).");
}

var tracker = new ActivityTracker(
    idleThreshold: TimeSpan.FromSeconds(config.IdleThresholdSec),
    sampleInterval: TimeSpan.FromMilliseconds(config.SampleIntervalMs));

tracker.SliceClosed += closed =>
{
    store.MarkClosed(closed);
    var duration = closed.EndTs - closed.StartTs;
    Log($"CLOSED  {closed.DisplayName,-30} {Fmt(closed.StartTs)} -> {Fmt(closed.EndTs)}  ({FormatDuration(duration)})");
};

SystemEvents.SessionSwitch += (_, e) =>
{
    if (e.Reason == SessionSwitchReason.SessionLock)
    {
        Log("SESSION LOCKED");
        tracker.OnSessionLock();
    }
    else if (e.Reason == SessionSwitchReason.SessionUnlock)
    {
        Log("SESSION UNLOCKED");
        tracker.OnSessionUnlock();
    }
};

SystemEvents.PowerModeChanged += (_, e) =>
{
    if (e.Mode == PowerModes.Suspend)
    {
        Log("SYSTEM SUSPENDING");
        tracker.OnSuspend();
    }
    else if (e.Mode == PowerModes.Resume)
    {
        Log("SYSTEM RESUMED");
        tracker.OnResume();
    }
};

var running = true;
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    running = false;
};

Log($"ScreenTime Agent starting. idleThreshold={config.IdleThresholdSec}s sampleInterval={config.SampleIntervalMs}ms");
Log($"Local queue: {queueDbPath}");
Log("Press Ctrl+C to stop.");
Log("");

string? lastLoggedExe = null;
var lastPersistOpen = DateTimeOffset.MinValue;
var tickCount = 0;

using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(config.SampleIntervalMs));
while (running && await timer.WaitForNextTickAsync())
{
    tracker.Tick();
    tickCount++;

    var open = tracker.Current;
    if (open is not null)
    {
        if (!string.Equals(open.Exe, lastLoggedExe, StringComparison.OrdinalIgnoreCase))
        {
            Log($"ACTIVE  {open.DisplayName} ({open.Exe}) - slice started at {Fmt(open.StartTs)}");
            lastLoggedExe = open.Exe;
        }

        if (DateTimeOffset.UtcNow - lastPersistOpen >= TimeSpan.FromSeconds(config.UploadIntervalSec))
        {
            store.UpsertOpenSlice(open);
            lastPersistOpen = DateTimeOffset.UtcNow;
        }
    }
    else
    {
        lastLoggedExe = null;
    }

    // Heartbeat every ~10s so the idle countdown is visible during manual testing
    // (e.g. confirming AFK-in-Minecraft gets trimmed instead of counted).
    if (tickCount % 10 == 0)
    {
        var idleSec = tracker.LastIdleMs / 1000.0;
        var state = tracker.IsLocked ? "LOCKED" : open is not null ? "active" : "AFK";
        Log($"  ... [{state}] idle={idleSec:F0}s (afk-threshold={config.IdleThresholdSec}s) focus={open?.DisplayName ?? "(none)"}");
    }

    if (uploader is not null && uploader.ShouldAttempt(DateTimeOffset.UtcNow))
    {
        var result = await uploader.TryUploadAsync(store, CancellationToken.None);
        if (result.Attempted)
        {
            Log(result.Ok
                ? $"UPLOAD  sent {result.Count} slice(s) to server"
                : $"UPLOAD  failed ({result.Error}) - backing off");
        }
    }
}

// Graceful shutdown: flush the open slice, trimmed to last real input.
tracker.Shutdown();
Log("Stopped.");

static void Log(string message) =>
    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {message}");

static string Fmt(DateTimeOffset ts) => ts.ToLocalTime().ToString("HH:mm:ss", CultureInfo.InvariantCulture);

static string FormatDuration(TimeSpan d) =>
    d.TotalHours >= 1
        ? $"{(int)d.TotalHours}h{d.Minutes}m{d.Seconds}s"
        : d.TotalMinutes >= 1
            ? $"{d.Minutes}m{d.Seconds}s"
            : $"{d.Seconds}s";
