using DatabaseEntities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace MigrationHandler;

public class App_DBContextFactory : IDesignTimeDbContextFactory<App_DBContext> {
    public App_DBContext CreateDbContext(string[] args) {
        // Build configuration from the API project's appsettings.json
        IConfigurationRoot configuration = new ConfigurationBuilder()
            .SetBasePath(Path.Combine(Directory.GetCurrentDirectory(), "../../", "Backend"))
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .Build();

        DbContextOptionsBuilder<App_DBContext> optionsBuilder = new();
        string? connectionString = configuration.GetConnectionString("DefaultConnection");

        optionsBuilder.UseSqlServer(connectionString, b => b.MigrationsAssembly("MigrationHandler"));

        return new App_DBContext(optionsBuilder.Options);
    }
}
