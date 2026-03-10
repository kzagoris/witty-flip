using Xunit;

public class DeduplicationTests
{
    [Fact]
    public void PassesThroughNewAlertsNotPresentInState()
    {
        var alerts = AlertLogic.FilterSuppressedAlerts(
            ["disk_high: Disk usage at 90%"],
            new Dictionary<string, DateTime>(),
            new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Single(alerts);
    }

    [Fact]
    public void SuppressesAlertsInsideOneHourWindow()
    {
        var alerts = AlertLogic.FilterSuppressedAlerts(
            ["disk_high: Disk usage at 90%"],
            new Dictionary<string, DateTime>
            {
                ["disk_high"] = new DateTime(2026, 3, 10, 10, 0, 0, DateTimeKind.Utc),
            },
            new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Empty(alerts);
    }

    [Fact]
    public void AllowsAlertsOutsideOneHourWindow()
    {
        var alerts = AlertLogic.FilterSuppressedAlerts(
            ["disk_high: Disk usage at 90%"],
            new Dictionary<string, DateTime>
            {
                ["disk_high"] = new DateTime(2026, 3, 10, 8, 0, 0, DateTimeKind.Utc),
            },
            new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Single(alerts);
    }

    [Fact]
    public void FiltersMixedAlertSetsCorrectly()
    {
        var alerts = AlertLogic.FilterSuppressedAlerts(
            [
                "disk_high: Disk usage at 90%",
                "queue_backlog: 22 jobs queued",
            ],
            new Dictionary<string, DateTime>
            {
                ["disk_high"] = new DateTime(2026, 3, 10, 10, 0, 0, DateTimeKind.Utc),
            },
            new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Single(alerts);
        Assert.Equal("queue_backlog: 22 jobs queued", alerts[0]);
    }

    [Fact]
    public void DeDuplicatesRepeatedKeysWithinTheSameBatch()
    {
        var alerts = AlertLogic.FilterSuppressedAlerts(
            [
                "disk_high: Disk usage at 91%",
                "disk_high: Disk usage at 92%",
            ],
            new Dictionary<string, DateTime>(),
            new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Single(alerts);
        Assert.Equal("disk_high: Disk usage at 91%", alerts[0]);
    }

    [Fact]
    public void LoadStateReturnsEmptyDictionaryForMissingFile()
    {
        var path = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"), "missing.json");

        var state = AlertLogic.LoadState(path);

        Assert.Empty(state);
    }

    [Fact]
    public void LoadStateReturnsEmptyDictionaryForCorruptedJson()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "state.json");
        File.WriteAllText(path, "{ not valid json ");

        try
        {
            var state = AlertLogic.LoadState(path);
            Assert.Empty(state);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void SaveStateCreatesParentDirectoryWhenMissing()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        var path = Path.Combine(root, "nested", "state.json");

        try
        {
            AlertLogic.SaveState(path, new Dictionary<string, DateTime>
            {
                ["disk_high"] = new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc),
            });

            Assert.True(File.Exists(path));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [Fact]
    public void SaveStateRoundTripsCorrectly()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "state.json");

        try
        {
            var expected = new Dictionary<string, DateTime>
            {
                ["disk_high"] = new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc),
                ["queue_backlog"] = new DateTime(2026, 3, 10, 10, 35, 0, DateTimeKind.Utc),
            };

            AlertLogic.SaveState(path, expected);
            var actual = AlertLogic.LoadState(path);

            Assert.Equal(expected.Keys.OrderBy(key => key), actual.Keys.OrderBy(key => key));
            Assert.Equal(expected["disk_high"], actual["disk_high"]);
            Assert.Equal(expected["queue_backlog"], actual["queue_backlog"]);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
