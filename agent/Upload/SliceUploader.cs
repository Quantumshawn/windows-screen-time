using System.Net.Http.Headers;
using System.Net.Http.Json;
using ScreenTime.Agent.Storage;

namespace ScreenTime.Agent.Upload;

public readonly record struct UploadResult(bool Attempted, bool Ok, int Count, string? Error)
{
    public static readonly UploadResult NotAttempted = new(false, true, 0, null);
    public static UploadResult Success(int count) => new(true, true, count, null);
    public static UploadResult Failed(string error) => new(true, false, 0, error);
}

/// <summary>
/// Pushes pending slices to the server on a healthy-interval cadence, backing off on failure.
/// Runs single-threaded on the main sampling loop (awaited inline) rather than on a background
/// task, so it never races the loop's own SQLite writes — the tradeoff is that a hung/unreachable
/// server can stall sampling for up to the HttpClient timeout, which is bounded deliberately low.
/// </summary>
public sealed class SliceUploader
{
    private static readonly TimeSpan[] BackoffSteps =
    {
        TimeSpan.FromSeconds(60),
        TimeSpan.FromMinutes(2),
        TimeSpan.FromMinutes(5),
        TimeSpan.FromMinutes(15),
    };

    private readonly HttpClient _http;
    private readonly string _slicesUrl;
    private readonly string _deviceId;
    private readonly TimeSpan _healthyInterval;
    private int _consecutiveFailures;
    private DateTimeOffset _nextAttemptAt = DateTimeOffset.MinValue;

    public SliceUploader(HttpClient http, string apiUrl, string deviceToken, string deviceId, TimeSpan healthyInterval)
    {
        _http = http;
        _http.Timeout = TimeSpan.FromSeconds(10);
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", deviceToken);
        _slicesUrl = $"{apiUrl.TrimEnd('/')}/api/v1/slices";
        _deviceId = deviceId;
        _healthyInterval = healthyInterval;
    }

    public bool ShouldAttempt(DateTimeOffset now) => now >= _nextAttemptAt;

    public async Task<UploadResult> TryUploadAsync(SliceQueueStore store, CancellationToken ct)
    {
        var pending = store.GetPending();
        if (pending.Count == 0)
        {
            _consecutiveFailures = 0;
            _nextAttemptAt = DateTimeOffset.UtcNow + _healthyInterval;
            return UploadResult.NotAttempted;
        }

        var payload = new
        {
            deviceId = _deviceId,
            slices = pending.Select(p => new
            {
                id = p.Id,
                exe = p.Exe,
                displayName = p.DisplayName,
                start = p.StartTs.ToUnixTimeSeconds(),
                end = p.EndTs.ToUnixTimeSeconds(),
            }),
        };

        try
        {
            using var response = await _http.PostAsJsonAsync(_slicesUrl, payload, ct);
            if (response.IsSuccessStatusCode)
            {
                var closedIds = pending.Where(p => p.Closed).Select(p => p.Id);
                store.DeleteClosedUploaded(closedIds);
                _consecutiveFailures = 0;
                _nextAttemptAt = DateTimeOffset.UtcNow + _healthyInterval;
                return UploadResult.Success(pending.Count);
            }

            RegisterFailure();
            return UploadResult.Failed($"HTTP {(int)response.StatusCode}");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            RegisterFailure();
            return UploadResult.Failed(ex.Message);
        }
    }

    private void RegisterFailure()
    {
        var step = BackoffSteps[Math.Min(_consecutiveFailures, BackoffSteps.Length - 1)];
        _consecutiveFailures++;
        _nextAttemptAt = DateTimeOffset.UtcNow + step;
    }
}
