using System.Text.Json.Nodes;
using Xunit;

public class ThresholdEvaluationTests
{
    private static JsonNode BuildHealthyMetrics() => JsonNode.Parse(
        """
        {
          "disk": { "available": true, "usedPercent": 40 },
          "queue": { "queuedJobs": 3, "stalledJobs": 0 },
          "conversions": {
            "last1h": { "successRate": 99, "total": 20 },
            "lastSuccessfulAt": "2026-03-10T10:20:00Z"
          },
          "events": { "last1h": { "artifactMissing": 0 } }
        }
        """
    )!;

    [Fact]
    public void ReturnsNoAlertsForHealthyMetrics()
    {
        var alerts = AlertLogic.EvaluateMetrics(BuildHealthyMetrics(), new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Empty(alerts);
    }

    [Fact]
    public void EmitsMetricsPartialWhenDiskAvailabilityIsFalse()
    {
        var metrics = BuildHealthyMetrics();
        metrics["disk"]!["available"] = false;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Contains("metrics_partial: Disk metrics unavailable", alerts);
    }

    [Fact]
    public void EmitsDiskHighWhenDiskUsageExceedsThreshold()
    {
        var metrics = BuildHealthyMetrics();
        metrics["disk"]!["usedPercent"] = 81;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Contains("disk_high: Disk usage at 81%", alerts);
    }

    [Fact]
    public void EmitsQueueBacklogWhenQueuedJobsExceedThreshold()
    {
        var metrics = BuildHealthyMetrics();
        metrics["queue"]!["queuedJobs"] = 21;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Contains("queue_backlog: 21 jobs queued", alerts);
    }

    [Fact]
    public void EmitsQueueStalledWhenStalledJobsExist()
    {
        var metrics = BuildHealthyMetrics();
        metrics["queue"]!["stalledJobs"] = 2;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Contains("queue_stalled: 2 conversion jobs appear stalled", alerts);
    }

    [Fact]
    public void EmitsErrorRateHighWhenSuccessRateDropsBelowThreshold()
    {
        var metrics = BuildHealthyMetrics();
        metrics["conversions"]!["last1h"]!["successRate"] = 74;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Contains("error_rate_high: Success rate 74% in last hour", alerts);
    }

    [Fact]
    public void DoesNotEmitErrorRateHighWhenTotalIsZero()
    {
        var metrics = BuildHealthyMetrics();
        metrics["conversions"]!["last1h"]!["successRate"] = 0;
        metrics["conversions"]!["last1h"]!["total"] = 0;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.DoesNotContain(alerts, alert => alert.StartsWith("error_rate_high:"));
    }

    [Fact]
    public void EmitsArtifactMissingWhenArtifactsDisappear()
    {
        var metrics = BuildHealthyMetrics();
        metrics["events"]!["last1h"]!["artifactMissing"] = 3;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Contains("artifact_missing: 3 completed artifacts went missing in the last hour", alerts);
    }

    [Fact]
    public void EmitsNoRecentSuccessWhenLatestSuccessIsTooOld()
    {
        var metrics = BuildHealthyMetrics();
        metrics["conversions"]!["lastSuccessfulAt"] = "2026-03-10T09:55:00Z";

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Contains("no_recent_success: Last successful conversion at 2026-03-10T09:55:00Z", alerts);
    }

    [Fact]
    public void EmitsMultipleAlertsWhenSeveralThresholdsAreBreached()
    {
        var metrics = BuildHealthyMetrics();
        metrics["disk"]!["available"] = false;
        metrics["disk"]!["usedPercent"] = 95;
        metrics["queue"]!["queuedJobs"] = 44;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Contains("metrics_partial: Disk metrics unavailable", alerts);
        Assert.Contains("disk_high: Disk usage at 95%", alerts);
        Assert.Contains("queue_backlog: 44 jobs queued", alerts);
    }

    [Fact]
    public void IgnoresMalformedMetricValuesInsteadOfThrowing()
    {
        var metrics = BuildHealthyMetrics();
        metrics["disk"]!["usedPercent"] = "not-a-number";
        metrics["queue"]!["queuedJobs"] = "oops";
        metrics["conversions"]!["lastSuccessfulAt"] = 123;

        var alerts = AlertLogic.EvaluateMetrics(metrics, new DateTime(2026, 3, 10, 10, 30, 0, DateTimeKind.Utc));

        Assert.Empty(alerts);
    }
}
