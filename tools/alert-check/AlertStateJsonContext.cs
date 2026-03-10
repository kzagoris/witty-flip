using System.Text.Json.Serialization;

[JsonSourceGenerationOptions(WriteIndented = true)]
[JsonSerializable(typeof(Dictionary<string, DateTime>), TypeInfoPropertyName = "AlertStateDictionary")]
internal partial class AlertStateJsonContext : JsonSerializerContext
{
}
