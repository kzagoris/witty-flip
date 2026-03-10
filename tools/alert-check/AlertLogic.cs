using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class AlertLogic
{
    public static List<string> EvaluateMetrics(JsonNode? json, DateTime nowUtc)
    {
        var alerts = new List<string>();
        if (json is null)
        {
            return alerts;
        }

        var diskAvailable = ReadBool(json["disk"]?["available"], defaultValue: true);
        if (!diskAvailable)
        {
            alerts.Add("metrics_partial: Disk metrics unavailable");
        }

        var diskPercent = ReadInt(json["disk"]?["usedPercent"], defaultValue: 0);
        if (diskPercent > 80)
        {
            alerts.Add($"disk_high: Disk usage at {diskPercent}%");
        }

        var queuedJobs = ReadInt(json["queue"]?["queuedJobs"], defaultValue: 0);
        if (queuedJobs > 20)
        {
            alerts.Add($"queue_backlog: {queuedJobs} jobs queued");
        }

        var stalledJobs = ReadInt(json["queue"]?["stalledJobs"], defaultValue: 0);
        if (stalledJobs > 0)
        {
            alerts.Add($"queue_stalled: {stalledJobs} conversion jobs appear stalled");
        }

        var successRate = ReadInt(json["conversions"]?["last1h"]?["successRate"], defaultValue: 100);
        var total = ReadInt(json["conversions"]?["last1h"]?["total"], defaultValue: 0);
        if (total > 0 && successRate < 75)
        {
            alerts.Add($"error_rate_high: Success rate {successRate}% in last hour");
        }

        var artifactMissing = ReadInt(json["events"]?["last1h"]?["artifactMissing"], defaultValue: 0);
        if (artifactMissing > 0)
        {
            alerts.Add($"artifact_missing: {artifactMissing} completed artifacts went missing in the last hour");
        }

        var lastSuccessStr = ReadString(json["conversions"]?["lastSuccessfulAt"]);
        if (!string.IsNullOrWhiteSpace(lastSuccessStr)
            && DateTime.TryParse(
                lastSuccessStr,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var lastSuccess)
            && nowUtc - lastSuccess > TimeSpan.FromMinutes(30))
        {
            alerts.Add($"no_recent_success: Last successful conversion at {lastSuccessStr}");
        }

        return alerts;
    }

    public static List<string> FilterSuppressedAlerts(
        IEnumerable<string> alerts,
        Dictionary<string, DateTime> state,
        DateTime nowUtc)
    {
        var filtered = new List<string>();
        var seenKeys = new HashSet<string>(StringComparer.Ordinal);

        foreach (var alert in alerts)
        {
            var key = ExtractAlertKey(alert);
            if (string.IsNullOrEmpty(key) || !seenKeys.Add(key))
            {
                continue;
            }

            if (state.TryGetValue(key, out var lastSent)
                && nowUtc - lastSent <= TimeSpan.FromHours(1))
            {
                continue;
            }

            filtered.Add(alert);
        }

        return filtered;
    }

    public static string FormatAlertBody(IEnumerable<string> alerts) =>
        string.Join("\n", alerts);

    public static string ExtractAlertKey(string alert)
    {
        if (string.IsNullOrWhiteSpace(alert))
        {
            return string.Empty;
        }

        var trimmed = alert.Trim();
        var separatorIndex = trimmed.IndexOf(':');
        if (separatorIndex < 0)
        {
            return trimmed;
        }

        return trimmed[..separatorIndex].Trim();
    }

    public static Dictionary<string, DateTime> LoadState(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return new Dictionary<string, DateTime>();
            }

            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize(json, AlertStateJsonContext.Default.AlertStateDictionary)
                ?? new Dictionary<string, DateTime>();
        }
        catch
        {
            return new Dictionary<string, DateTime>();
        }
    }

    public static void SaveState(string path, Dictionary<string, DateTime> state)
    {
        try
        {
            var directory = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var temporaryPath = path + ".tmp";
            File.WriteAllText(
                temporaryPath,
                JsonSerializer.Serialize(state, AlertStateJsonContext.Default.AlertStateDictionary));
            File.Move(temporaryPath, path, overwrite: true);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Failed to save alert state: {ex.Message}");
        }
    }

    private static bool ReadBool(JsonNode? node, bool defaultValue)
    {
        try
        {
            if (node is null)
            {
                return defaultValue;
            }

            if (node is JsonValue value)
            {
                if (value.TryGetValue<bool>(out var boolValue))
                {
                    return boolValue;
                }

                if (value.TryGetValue<string>(out var stringValue)
                    && bool.TryParse(stringValue, out var parsedBool))
                {
                    return parsedBool;
                }
            }
        }
        catch
        {
        }

        return defaultValue;
    }

    private static int ReadInt(JsonNode? node, int defaultValue)
    {
        try
        {
            if (node is null)
            {
                return defaultValue;
            }

            if (node is JsonValue value)
            {
                if (value.TryGetValue<int>(out var intValue))
                {
                    return intValue;
                }

                if (value.TryGetValue<string>(out var stringValue)
                    && int.TryParse(stringValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedInt))
                {
                    return parsedInt;
                }
            }
        }
        catch
        {
        }

        return defaultValue;
    }

    private static string? ReadString(JsonNode? node)
    {
        try
        {
            if (node is null)
            {
                return null;
            }

            if (node is JsonValue value && value.TryGetValue<string>(out var stringValue))
            {
                return stringValue;
            }
        }
        catch
        {
        }

        return null;
    }
}
