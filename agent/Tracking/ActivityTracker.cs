using ScreenTime.Agent.Native;

namespace ScreenTime.Agent.Tracking;

/// <summary>
/// Core state machine: turns 1-second Win32 samples into app-focus slices.
///
/// "Active" requires real input (keyboard/mouse, or cursor movement as a fallback for games
/// that don't update GetLastInputInfo) within the idle threshold, and no lock/suspend. When
/// activity lapses, the open slice is closed retroactively at the last real input timestamp —
/// not "now" — so idle time never gets counted as screen time (this is what makes AFK-farming
/// in a game contribute zero extra seconds instead of up to one idle-threshold's worth).
/// </summary>
public sealed class ActivityTracker
{
    private readonly TimeSpan _idleThreshold;
    private readonly TimeSpan _sampleInterval;
    private readonly object _gate = new();

    private DateTimeOffset _lastRealInput = DateTimeOffset.UtcNow;
    private bool _seededFromRealIdle;
    private POINT _lastCursorPos;
    private bool _hasCursorSample;
    private bool _locked;
    private bool _suspended;
    private OpenSlice? _current;
    private uint _lastIdleMs;

    public ActivityTracker(TimeSpan idleThreshold, TimeSpan sampleInterval)
    {
        _idleThreshold = idleThreshold;
        _sampleInterval = sampleInterval;
    }

    /// <summary>Fired whenever a slice finalizes (app switch, AFK, lock, suspend, or shutdown).</summary>
    public event Action<ClosedSlice>? SliceClosed;

    public OpenSlice? Current { get { lock (_gate) return _current; } }
    public uint LastIdleMs { get { lock (_gate) return _lastIdleMs; } }
    public bool IsLocked { get { lock (_gate) return _locked; } }

    public void OnSessionLock()
    {
        lock (_gate)
        {
            _locked = true;
            CloseCurrent(DateTimeOffset.UtcNow);
        }
    }

    public void OnSessionUnlock()
    {
        lock (_gate)
        {
            _locked = false;
        }
    }

    public void OnSuspend()
    {
        lock (_gate)
        {
            _suspended = true;
            CloseCurrent(_lastRealInput);
        }
    }

    public void OnResume()
    {
        lock (_gate)
        {
            _suspended = false;
        }
    }

    public void Tick()
    {
        lock (_gate)
        {
            var now = DateTimeOffset.UtcNow;

            _lastIdleMs = NativeMethods.GetIdleMilliseconds();
            var cursor = NativeMethods.ReadCursorPos();
            bool cursorMoved = _hasCursorSample && (cursor.X != _lastCursorPos.X || cursor.Y != _lastCursorPos.Y);
            _lastCursorPos = cursor;
            _hasCursorSample = true;

            if (!_seededFromRealIdle)
            {
                // Seed from Windows' real idle reading rather than assuming "active right now" —
                // otherwise starting the agent while genuinely AFK (e.g. autostart at login,
                // before walking back to the desk) would grant a false idle-threshold-long
                // window of counted "active" time before the tracker catches up to reality.
                _lastRealInput = now - TimeSpan.FromMilliseconds(_lastIdleMs);
                _seededFromRealIdle = true;
            }
            else if (cursorMoved || _lastIdleMs < (uint)_sampleInterval.TotalMilliseconds)
            {
                _lastRealInput = now;
            }

            bool active = !_locked && !_suspended && (now - _lastRealInput) < _idleThreshold;

            if (!active)
            {
                CloseCurrent(_lastRealInput);
                return;
            }

            var app = ForegroundAppResolver.GetForegroundApp();
            if (app is null)
            {
                CloseCurrent(now);
                return;
            }

            if (_current is null)
            {
                _current = NewSlice(app.Value, now);
            }
            else if (!string.Equals(_current.Exe, app.Value.Exe, StringComparison.OrdinalIgnoreCase))
            {
                CloseCurrent(now);
                _current = NewSlice(app.Value, now);
            }
            else
            {
                _current.EndTs = now;
            }
        }
    }

    /// <summary>Flush the open slice (if any) on graceful shutdown, trimmed to last real input.</summary>
    public void Shutdown()
    {
        lock (_gate)
        {
            CloseCurrent(_lastRealInput);
        }
    }

    private static OpenSlice NewSlice(ForegroundApp app, DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid().ToString("N"),
        Exe = app.Exe,
        DisplayName = app.DisplayName,
        StartTs = now,
        EndTs = now,
    };

    private void CloseCurrent(DateTimeOffset end)
    {
        if (_current is null)
        {
            return;
        }

        var toClose = _current;
        _current = null;

        if (end <= toClose.StartTs)
        {
            return; // guard against a zero/negative-length slice
        }

        SliceClosed?.Invoke(new ClosedSlice(toClose.Id, toClose.Exe, toClose.DisplayName, toClose.StartTs, end));
    }
}
