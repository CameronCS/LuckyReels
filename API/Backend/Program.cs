using AutoMapper;
using BusinessLogicService;
using DatabaseEntities;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SystemFramework.Exceptions;
using SystemFramework.JWTAuthentication;
using SystemFramework.Security;
using SystemFramework.SignalR;

namespace Backend;

public class Program {
    public static void Main(string[] args) {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllers();
        builder.Services.AddSignalR();

        builder.Services.AddJWTAuthentication(options => {
            options.PrivateKey = builder.Configuration.GetValue<string>("JwtKey");
        });

        builder.Services.AddApiVersioning(options => {
            options.AssumeDefaultVersionWhenUnspecified = true;
            options.DefaultApiVersion = new Asp.Versioning.ApiVersion(1, 0);
            options.ReportApiVersions = true;
        });

        builder.Services.AddActiveTenantService();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IErrorService, BusinessLogicService.ErrorService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IErrorService, DataAccessService.ErrorService>();

        builder.Services.AddSingleton(sp => {
            ILoggerFactory loggerFactory = sp.GetRequiredService<ILoggerFactory>();
            MapperConfiguration mapperConfiguration = new(cfg => {
                cfg.LicenseKey = builder.Configuration.GetValue("AutoMapperKey", string.Empty);
                cfg.AddMaps(typeof(MappingProfile).Assembly);
            }, loggerFactory);
            return mapperConfiguration.CreateMapper();
        });

        builder.Services.AddDbContext<App_DBContext>(options => {
            options.UseSqlServer(
            builder.Configuration.GetConnectionString("DefaultConnection"),
                b => b.MigrationsAssembly("MigrationHandler")
            );
            options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
            options.EnableSensitiveDataLogging(false);
            options.ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning));
        });

        builder.Services.AddSingleton<IUserIdProvider, IdBasedNameIdentifier>();

        WebApplication app = builder.Build();

        using (IServiceScope scope = app.Services.CreateScope()) {
            App_DBContext context = scope.ServiceProvider.GetRequiredService<App_DBContext>();
            context.Database.Migrate();
        }

        app.UseMiddleware<ExceptionHandlingMiddleware>();
        app.UseHttpsRedirection();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapHub<SystemHub>("/hub");
        app.UseAuthorization();
        app.MapControllers();
        app.Run();
    }
}
