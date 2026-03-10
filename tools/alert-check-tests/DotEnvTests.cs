using Xunit;

public class DotEnvTests
{
    [Fact]
    public void ParseLineReturnsKeyValueForBasicAssignment()
    {
        var entry = DotEnv.ParseLine("METRICS_API_KEY=secret-value");

        Assert.NotNull(entry);
        Assert.Equal("METRICS_API_KEY", entry.Value.Key);
        Assert.Equal("secret-value", entry.Value.Value);
    }

    [Fact]
    public void ParseLineIgnoresCommentsAndMalformedLines()
    {
        Assert.Null(DotEnv.ParseLine("# comment"));
        Assert.Null(DotEnv.ParseLine("just-text"));
        Assert.Null(DotEnv.ParseLine("   "));
    }

    [Fact]
    public void LoadFileDoesNotOverrideExistingEnvironmentValues()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var envPath = Path.Combine(root, ".env");

        try
        {
            File.WriteAllText(envPath, "METRICS_API_KEY=from-file\nBASE_URL=http://from-file");
            Environment.SetEnvironmentVariable("METRICS_API_KEY", "already-set");
            Environment.SetEnvironmentVariable("BASE_URL", null);

            DotEnv.LoadFile(envPath);

            Assert.Equal("already-set", Environment.GetEnvironmentVariable("METRICS_API_KEY"));
            Assert.Equal("http://from-file", Environment.GetEnvironmentVariable("BASE_URL"));
        }
        finally
        {
            Environment.SetEnvironmentVariable("METRICS_API_KEY", null);
            Environment.SetEnvironmentVariable("BASE_URL", null);
            Directory.Delete(root, recursive: true);
        }
    }
}
