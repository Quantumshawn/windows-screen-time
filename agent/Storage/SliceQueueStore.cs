using Microsoft.Data.Sqlite;
using ScreenTime.Agent.Tracking;

namespace ScreenTime.Agent.Storage;

public sealed record PendingSlice(string Id, string Exe, string DisplayName, DateTimeOffset StartTs, DateTimeOffset EndTs, bool Closed);

/// <summary>
/// Local offline queue for slices awaiting upload. Survives reboots and network outages.
/// Rows are keyed by the client-generated slice id, so repeated upserts of a still-growing
/// open slice are cheap in-place updates, and re-uploads after a retry are naturally idempotent.
/// </summary>
public sealed class SliceQueueStore : IDisposable
{
    private readonly SqliteConnection _conn;

    public SliceQueueStore(string dbPath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
        _conn = new SqliteConnection($"Data Source={dbPath}");
        _conn.Open();

        using var cmd = _conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS pending_slices (
                id TEXT PRIMARY KEY,
                exe TEXT NOT NULL,
                display_name TEXT NOT NULL,
                start_ts INTEGER NOT NULL,
                end_ts INTEGER NOT NULL,
                closed INTEGER NOT NULL
            );
            """;
        cmd.ExecuteNonQuery();
    }

    public void UpsertOpenSlice(OpenSlice slice) =>
        Upsert(slice.Id, slice.Exe, slice.DisplayName, slice.StartTs, slice.EndTs, closed: false);

    public void MarkClosed(ClosedSlice slice) =>
        Upsert(slice.Id, slice.Exe, slice.DisplayName, slice.StartTs, slice.EndTs, closed: true);

    private void Upsert(string id, string exe, string displayName, DateTimeOffset start, DateTimeOffset end, bool closed)
    {
        using var cmd = _conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO pending_slices (id, exe, display_name, start_ts, end_ts, closed)
            VALUES ($id, $exe, $name, $start, $end, $closed)
            ON CONFLICT(id) DO UPDATE SET end_ts = excluded.end_ts, closed = excluded.closed;
            """;
        cmd.Parameters.AddWithValue("$id", id);
        cmd.Parameters.AddWithValue("$exe", exe);
        cmd.Parameters.AddWithValue("$name", displayName);
        cmd.Parameters.AddWithValue("$start", start.ToUnixTimeSeconds());
        cmd.Parameters.AddWithValue("$end", end.ToUnixTimeSeconds());
        cmd.Parameters.AddWithValue("$closed", closed ? 1 : 0);
        cmd.ExecuteNonQuery();
    }

    public List<PendingSlice> GetPending(int limit = 500)
    {
        var results = new List<PendingSlice>();
        using var cmd = _conn.CreateCommand();
        cmd.CommandText = "SELECT id, exe, display_name, start_ts, end_ts, closed FROM pending_slices ORDER BY start_ts LIMIT $limit;";
        cmd.Parameters.AddWithValue("$limit", limit);

        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            results.Add(new PendingSlice(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                DateTimeOffset.FromUnixTimeSeconds(reader.GetInt64(3)),
                DateTimeOffset.FromUnixTimeSeconds(reader.GetInt64(4)),
                reader.GetInt64(5) != 0));
        }
        return results;
    }

    /// <summary>
    /// Finalizes any row still marked open from a previous run. A row can only be left open here
    /// if the agent was killed/crashed before a graceful shutdown could close it in-memory — the
    /// in-memory tracker that owned it no longer exists, so it will never receive a real close
    /// event. Without this, such a row would sit at closed=0 forever and get re-uploaded on every
    /// batch. Finalizing it at its last checkpointed end_ts is exactly the documented crash-recovery
    /// guarantee: at most ~60s of the slice's tail is lost, not the whole slice.
    /// </summary>
    public int CloseOrphanedOpenSlices()
    {
        using var cmd = _conn.CreateCommand();
        cmd.CommandText = "UPDATE pending_slices SET closed = 1 WHERE closed = 0;";
        return cmd.ExecuteNonQuery();
    }

    /// <summary>Removes acknowledged, closed slices from the queue. Open slices are never deleted here.</summary>
    public void DeleteClosedUploaded(IEnumerable<string> ids)
    {
        using var transaction = _conn.BeginTransaction();
        using var cmd = _conn.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = "DELETE FROM pending_slices WHERE id = $id AND closed = 1;";
        var idParam = cmd.CreateParameter();
        idParam.ParameterName = "$id";
        cmd.Parameters.Add(idParam);

        foreach (var id in ids)
        {
            idParam.Value = id;
            cmd.ExecuteNonQuery();
        }
        transaction.Commit();
    }

    public void Dispose() => _conn.Dispose();
}
