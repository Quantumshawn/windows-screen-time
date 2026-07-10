using System.Text.Json;

namespace ScreenTime.Agent.Config;

public sealed class AgentConfig
{
    public string ApiUrl { get; set; } = "";
    public string DeviceToken { get; set; } = "";
    public string DeviceId { get; set; } = "desktop";
    public int IdleThresholdSec { get; set; } = 120;
    public int SampleIntervalMs { get; set; } = 1000;
    public int UploadIntervalSec { get; set; } = 60;

    private static string ConfigPath =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ScreenTime", "config.json");

    public static AgentConfig LoadOrCreate()
    {
        var path = ConfigPath;
        if (File.Exists(path))
        {
            try
            {
                var loaded = JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(path));
                if (loaded is not null)
                {
                    return loaded;
                }
            }
            catch (JsonException)
            {
                // Corrupt config file: fall through and regenerate defaults below.
            }
        }

        var config = new AgentConfig();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }));
        return config;
    }
}
