namespace Models;

public class Error {
    public int Id {
        get; set;
    }
    public DateTime Date {
        get; set;
    }
    public string Exception { get; set; } = "";
    public string Message { get; set; } = "";
    public string Uri { get; set; } = "";
    public string Host { get; set; } = "";
}
