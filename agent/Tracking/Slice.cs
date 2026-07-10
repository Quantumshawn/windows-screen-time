namespace ScreenTime.Agent.Tracking;

/// <summary>A slice still accumulating time — its End keeps advancing while the app stays focused.</summary>
public sealed class OpenSlice
{
    public required string Id { get; init; }
    public required string Exe { get; init; }
    public required string DisplayName { get; init; }
    public required DateTimeOffset StartTs { get; init; }
    public DateTimeOffset EndTs { get; set; }
}

/// <summary>A finalized slice, ready to persist and upload.</summary>
public sealed record ClosedSlice(string Id, string Exe, string DisplayName, DateTimeOffset StartTs, DateTimeOffset EndTs);
