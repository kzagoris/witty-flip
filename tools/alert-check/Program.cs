using System.Net;
using System.Net.Mail;
using System.Text.Json;
using System.Text.Json.Nodes;

var healthUrl = Env("HEALTH_URL", "http://localhost:3000/api/health/ready");
var metricsUrl = Env("METRICS_URL", "http://localhost:3000/api/metrics");
var metricsApiKey = Env("METRICS_API_KEY", "");
var alertEmailTo = Env("ALERT_EMAIL_TO", "");
var smtpHost = Env("ALERT_SMTP_HOST", "");
var smtpPort = int.TryParse(Env("ALERT_SMTP_PORT", "587"), out var p) ? p : 587;
var smtpUser = Env("ALERT_SMTP_USER", "");
var smtpPass = Env("ALERT_SMTP_PASS", "");
var alertEmailFrom = Env("ALERT_EMAIL_FROM", smtpUser);
var stateFile = Env("ALERT_STATE_FILE", "data/alert-state.json");

using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

var alerts = new List<string>();

// 1. Health check
try
{
    var healthResp = await http.GetAsync(healthUrl);
    if (!healthResp.IsSuccessStatusCode)
        alerts.Add($"app_down: Health endpoint returned {(int)healthResp.StatusCode}");
}
catch (Exception ex)
{
    alerts.Add($"app_down: Health endpoint unreachable — {ex.Message}");
    SendAlerts(alerts);
    return;
}

// 2. Metrics check
if (!string.IsNullOrEmpty(metricsApiKey))
{
    try
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, metricsUrl);
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", metricsApiKey);
        var resp = await http.SendAsync(req);

        if (resp.IsSuccessStatusCode)
        {
            var json = JsonNode.Parse(await resp.Content.ReadAsStringAsync());
            if (json is not null)
            {
                var diskPercent = json["disk"]?["usedPercent"]?.GetValue<int>() ?? 0;
                if (diskPercent > 80)
                    alerts.Add($"disk_high: Disk usage at {diskPercent}%");

                var queuedJobs = json["queue"]?["queuedJobs"]?.GetValue<int>() ?? 0;
                if (queuedJobs > 20)
                    alerts.Add($"queue_backlog: {queuedJobs} jobs queued");

                var successRate = json["conversions"]?["last1h"]?["successRate"]?.GetValue<int>() ?? 100;
                var total = json["conversions"]?["last1h"]?["total"]?.GetValue<int>() ?? 0;
                if (total > 0 && successRate < 75)
                    alerts.Add($"error_rate_high: Success rate {successRate}% in last hour");

                var lastSuccessStr = json["conversions"]?["lastSuccessfulAt"]?.GetValue<string>();
                if (lastSuccessStr is not null && DateTime.TryParse(lastSuccessStr, out var lastSuccess))
                {
                    if (DateTime.UtcNow - lastSuccess > TimeSpan.FromMinutes(30))
                        alerts.Add($"no_recent_success: Last successful conversion at {lastSuccessStr}");
                }
            }
        }
        else
        {
            alerts.Add($"metrics_error: Metrics endpoint returned {(int)resp.StatusCode}");
        }
    }
    catch (Exception ex)
    {
        alerts.Add($"metrics_error: {ex.Message}");
    }
}

SendAlerts(alerts);

void SendAlerts(List<string> alertList)
{
    if (alertList.Count == 0)
    {
        Console.WriteLine($"[{DateTime.UtcNow:O}] OK — no alerts");
        return;
    }

    // Dedup: check state file
    var state = LoadState(stateFile);
    var newAlerts = alertList.Where(a =>
    {
        var key = a.Split(':')[0];
        if (state.TryGetValue(key, out var lastSent))
            return DateTime.UtcNow - lastSent > TimeSpan.FromHours(1);
        return true;
    }).ToList();

    if (newAlerts.Count == 0)
    {
        Console.WriteLine($"[{DateTime.UtcNow:O}] Alerts suppressed (already sent within 1hr): {string.Join(", ", alertList.Select(a => a.Split(':')[0]))}");
        return;
    }

    Console.WriteLine($"[{DateTime.UtcNow:O}] ALERTS: {string.Join("; ", newAlerts)}");

    if (string.IsNullOrEmpty(alertEmailTo) || string.IsNullOrEmpty(smtpHost))
    {
        Console.WriteLine("Email not configured — skipping send");
        return;
    }

    try
    {
        using var smtp = new SmtpClient(smtpHost, smtpPort)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(smtpUser, smtpPass),
        };

        var body = string.Join("\n", newAlerts);
        var msg = new MailMessage(alertEmailFrom, alertEmailTo, "[WittyFlip Alert]", body);
        smtp.Send(msg);

        Console.WriteLine("Alert email sent successfully");

        // Update state only after successful send
        foreach (var alert in newAlerts)
        {
            var key = alert.Split(':')[0];
            state[key] = DateTime.UtcNow;
        }
        SaveState(stateFile, state);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Failed to send alert email: {ex.Message}");
        // Do NOT update state — next run should retry
    }
}

static Dictionary<string, DateTime> LoadState(string path)
{
    try
    {
        if (!File.Exists(path)) return new();
        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<Dictionary<string, DateTime>>(json) ?? new();
    }
    catch
    {
        return new();
    }
}

static void SaveState(string path, Dictionary<string, DateTime> state)
{
    try
    {
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        var tmp = path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(tmp, path, overwrite: true);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Failed to save alert state: {ex.Message}");
    }
}

static string Env(string key, string fallback) =>
    Environment.GetEnvironmentVariable(key) is { Length: > 0 } v ? v : fallback;
