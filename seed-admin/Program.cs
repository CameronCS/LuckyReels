string password = args.Length > 0 ? args[0] : "Admin123!";
string hash = BCrypt.Net.BCrypt.HashPassword(password, 11);
Console.WriteLine($"""

INSERT INTO UsrAdmin (Username, Email, PasswordHash)
VALUES ('admin', 'admin@luckyreels.com', '{hash}');

""");
