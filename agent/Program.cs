using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.Windows.Forms;
using Microsoft.Win32;
using ScreenTime.Agent.Config;
using ScreenTime.Agent.Logging;
using ScreenTime.Agent.Storage;
using ScreenTime.Agent.Tracking;
using ScreenTime.Agent.Upload;

FileLogger.Initialize();

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

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    // Only meaningful when launched from a terminal for dev/testing — autostart (no console)
    // exits via the tray icon's Exit item instead, which also lands here.
    e.Cancel = true;
    cts.Cancel();
    Application.Exit();
};

Log($"ScreenTime Agent starting. idleThreshold={config.IdleThresholdSec}s sampleInterval={config.SampleIntervalMs}ms");
Log($"Local queue: {queueDbPath}");
Log("");

var trackingTask = Task.Run(() => RunTrackingLoopAsync(cts.Token));

using var trayIcon = BuildTrayIcon();
Application.Run();

cts.Cancel();
await trackingTask;

async Task RunTrackingLoopAsync(CancellationToken ct)
{
    string? lastLoggedExe = null;
    var lastPersistOpen = DateTimeOffset.MinValue;
    var tickCount = 0;

    using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(config.SampleIntervalMs));
    try
    {
        while (await timer.WaitForNextTickAsync(ct))
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
    }
    catch (OperationCanceledException)
    {
        // Expected on shutdown (tray Exit or Ctrl+C) — fall through to the flush below.
    }

    // Graceful shutdown: flush the open slice, trimmed to last real input.
    tracker.Shutdown();
    Log("Stopped.");
}

NotifyIcon BuildTrayIcon()
{
    var openItem = new ToolStripMenuItem("Open Dashboard") { Enabled = !string.IsNullOrWhiteSpace(config.ApiUrl) };
    openItem.Click += (_, _) => OpenDashboard();

    var autostartItem = new ToolStripMenuItem("Start with Windows")
    {
        CheckOnClick = true,
        Checked = AutostartManager.IsEnabled(),
    };
    autostartItem.Click += (_, _) =>
    {
        if (autostartItem.Checked)
        {
            AutostartManager.Enable();
        }
        else
        {
            AutostartManager.Disable();
        }
    };

    var exitItem = new ToolStripMenuItem("Exit");
    exitItem.Click += (_, _) => Application.Exit();

    var menu = new ContextMenuStrip();
    menu.Items.Add(openItem);
    menu.Items.Add(autostartItem);
    menu.Items.Add(new ToolStripSeparator());
    menu.Items.Add(exitItem);

    var icon = new NotifyIcon
    {
        Icon = LoadAppIcon(),
        Text = "ScreenTime Agent",
        Visible = true,
        ContextMenuStrip = menu,
    };
    icon.DoubleClick += (_, _) => OpenDashboard();
    return icon;
}

void OpenDashboard()
{
    if (string.IsNullOrWhiteSpace(config.ApiUrl))
    {
        return;
    }

    try
    {
        Process.Start(new ProcessStartInfo(config.ApiUrl) { UseShellExecute = true });
    }
    catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception)
    {
        Log($"Failed to open dashboard: {ex.Message}");
    }
}

static Icon LoadAppIcon()
{
    // Extracts the icon baked into this exe via <ApplicationIcon> at build time — works for
    // the published single-file exe; falls back gracefully for dev-time `dotnet run` hosts
    // that don't carry it.
    try
    {
        var path = Environment.ProcessPath;
        if (!string.IsNullOrEmpty(path))
        {
            var extracted = Icon.ExtractAssociatedIcon(path);
            if (extracted is not null)
            {
                return extracted;
            }
        }
    }
    catch (Exception ex) when (ex is IOException or ArgumentException)
    {
        // Fall through to the system default below.
    }

    return SystemIcons.Application;
}

static void Log(string message) => FileLogger.Log(message);

static string Fmt(DateTimeOffset ts) => ts.ToLocalTime().ToString("HH:mm:ss", CultureInfo.InvariantCulture);

static string FormatDuration(TimeSpan d) =>
    d.TotalHours >= 1
        ? $"{(int)d.TotalHours}h{d.Minutes}m{d.Seconds}s"
        : d.TotalMinutes >= 1
            ? $"{d.Minutes}m{d.Seconds}s"
            : $"{d.Seconds}s";
