using Xunit;

public class AlertFormattingTests
{
    [Fact]
    public void FormatsSingleAlertBody()
    {
        var body = AlertLogic.FormatAlertBody(["disk_high: Disk usage at 90%"]);

        Assert.Equal("disk_high: Disk usage at 90%", body);
    }

    [Fact]
    public void FormatsMultipleAlertsWithNewLines()
    {
        var body = AlertLogic.FormatAlertBody([
            "disk_high: Disk usage at 90%",
            "queue_backlog: 21 jobs queued",
        ]);

        Assert.Equal("disk_high: Disk usage at 90%\nqueue_backlog: 21 jobs queued", body);
    }

    [Fact]
    public void FormatsEmptyAlertSetAsEmptyString()
    {
        var body = AlertLogic.FormatAlertBody(Array.Empty<string>());

        Assert.Equal(string.Empty, body);
    }

    [Fact]
    public void ExtractAlertKeySplitsOnFirstColon()
    {
        var key = AlertLogic.ExtractAlertKey("disk_high: Disk usage at 90%: warning");

        Assert.Equal("disk_high", key);
    }

    [Fact]
    public void ExtractAlertKeyHandlesValuesWithoutColon()
    {
        var key = AlertLogic.ExtractAlertKey("metrics_error");

        Assert.Equal("metrics_error", key);
    }

    [Fact]
    public void ExtractAlertKeyTrimsWhitespaceSafely()
    {
        var key = AlertLogic.ExtractAlertKey("  queue_backlog : 22 jobs queued  ");

        Assert.Equal("queue_backlog", key);
    }
}
