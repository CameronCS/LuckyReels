namespace Models;

public class ErrorLog
{
    public int ID { get; set; }
    public DateTime Date { get; set; }
    public string Exception { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Uri { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Host { get; set; } = string.Empty;
}
