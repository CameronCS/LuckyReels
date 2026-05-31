namespace Models;

public class AdminLog
{
    public long ID { get; set; }
    public int AdminID { get; set; }
    public string Action { get; set; } = string.Empty;
    public Guid? TargetID { get; set; }
    public string? Detail { get; set; }
    public DateTime CreatedAt { get; set; }
}
