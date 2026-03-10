using System.Net;
using System.Net.Mail;
using System.Text.Json.Nodes;

DotEnv.LoadNearest(".env.local", ".env");

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
var nowUtc = DateTime.UtcNow;

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
            alerts.AddRange(AlertLogic.EvaluateMetrics(json, nowUtc));
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
    var currentTime = DateTime.UtcNow;

    if (alertList.Count == 0)
    {
        Console.WriteLine($"[{currentTime:O}] OK — no alerts");
        return;
    }

    var state = AlertLogic.LoadState(stateFile);
    var newAlerts = AlertLogic.FilterSuppressedAlerts(alertList, state, currentTime);

    if (newAlerts.Count == 0)
    {
        Console.WriteLine($"[{currentTime:O}] Alerts suppressed (already sent within 1hr): {string.Join(", ", alertList.Select(AlertLogic.ExtractAlertKey))}");
        return;
    }

    Console.WriteLine($"[{currentTime:O}] ALERTS: {string.Join("; ", newAlerts)}");

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

        var body = AlertLogic.FormatAlertBody(newAlerts);
        var msg = new MailMessage(alertEmailFrom, alertEmailTo, "[WittyFlip Alert]", body);
        smtp.Send(msg);

        Console.WriteLine("Alert email sent successfully");

        // Update state only after successful send
        foreach (var alert in newAlerts)
        {
            var key = AlertLogic.ExtractAlertKey(alert);
            state[key] = currentTime;
        }
        AlertLogic.SaveState(stateFile, state);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Failed to send alert email: {ex.Message}");
        // Do NOT update state — next run should retry
    }
}

static string Env(string key, string fallback) =>
    Environment.GetEnvironmentVariable(key) is { Length: > 0 } v ? v : fallback;
