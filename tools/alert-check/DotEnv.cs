public static class DotEnv
{
    public static void LoadNearest(params string[] fileNames)
    {
        foreach (var directory in EnumerateSearchDirectories())
        {
            foreach (var fileName in fileNames)
            {
                var path = Path.Combine(directory, fileName);
                if (File.Exists(path))
                {
                    LoadFile(path);
                }
            }
        }
    }

    public static void LoadFile(string path)
    {
        foreach (var line in File.ReadLines(path))
        {
            var entry = ParseLine(line);
            if (entry is null || !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(entry.Value.Key)))
            {
                continue;
            }

            Environment.SetEnvironmentVariable(entry.Value.Key, entry.Value.Value);
        }
    }

    public static KeyValuePair<string, string>? ParseLine(string line)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#'))
        {
            return null;
        }

        if (trimmed.StartsWith("export ", StringComparison.Ordinal))
        {
            trimmed = trimmed[7..].Trim();
        }

        var separatorIndex = trimmed.IndexOf('=');
        if (separatorIndex <= 0)
        {
            return null;
        }

        var key = trimmed[..separatorIndex].Trim();
        if (string.IsNullOrEmpty(key))
        {
            return null;
        }

        var value = trimmed[(separatorIndex + 1)..].Trim();
        if (value.Length >= 2 &&
            ((value.StartsWith('"') && value.EndsWith('"')) || (value.StartsWith('\'') && value.EndsWith('\''))))
        {
            value = value[1..^1];
        }

        return KeyValuePair.Create(key, value);
    }

    private static IEnumerable<string> EnumerateSearchDirectories()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            if (string.IsNullOrWhiteSpace(start))
            {
                continue;
            }

            var current = Path.GetFullPath(start);
            while (seen.Add(current))
            {
                yield return current;

                var parent = Directory.GetParent(current);
                if (parent is null)
                {
                    break;
                }

                current = parent.FullName;
            }
        }
    }
}
