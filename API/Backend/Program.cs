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
using WebSocketServicePoint;

namespace Backend;

public class Program {
    public static void Main(string[] args) {
        WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

        string redisConnection = builder.Configuration.GetConnectionString("Redis");
        bool useRedis = !string.IsNullOrEmpty(redisConnection);

        builder.Services.AddControllers(options => options.Conventions.Add(new APIGateWay.GatewayControllerConvention()));

        builder.Services.AddCors(options => {
            options.AddDefaultPolicy(policy => policy
                .SetIsOriginAllowed(_ => true)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials());
        });

        ISignalRServerBuilder signalR = builder.Services.AddSignalR();
        if (useRedis) signalR.AddStackExchangeRedis(redisConnection);

        if (useRedis)
            builder.Services.AddStackExchangeRedisCache(options => options.Configuration = redisConnection);
        else
            builder.Services.AddDistributedMemoryCache();

        builder.Services.AddJWTAuthentication(options => {
            options.PrivateKey = builder.Configuration.GetValue<string>("JwtKey");
        });

        builder.Services.AddApiVersioning(options => {
            options.AssumeDefaultVersionWhenUnspecified = true;
            options.DefaultApiVersion = new Asp.Versioning.ApiVersion(1, 0);
            options.ReportApiVersions = true;
        }).AddMvc();

        builder.Services.AddActiveTenantService();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IErrorService, BusinessLogicService.ErrorService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IErrorService, DataAccessService.ErrorService>();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IAuthService, BusinessLogicService.AuthService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IAuthService, DataAccessService.AuthService>();

        builder.Services.AddTransient<BusinessLogicServiceInterface.ISlotService, BusinessLogicService.SlotService>();
        builder.Services.AddScoped<DataAccessServiceInterface.ISlotDataService, DataAccessService.SlotDataService>();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IBlackjackService, BusinessLogicService.BlackjackService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IBlackjackDataService, DataAccessService.BlackjackDataService>();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IRouletteService, BusinessLogicService.RouletteService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IRouletteDataService, DataAccessService.RouletteDataService>();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IHorseService, BusinessLogicService.HorseService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IHorseDataService, DataAccessService.HorseDataService>();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IBaccaratService, BusinessLogicService.BaccaratService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IBaccaratDataService, DataAccessService.BaccaratDataService>();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IMinesService, BusinessLogicService.MinesService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IMinesDataService, DataAccessService.MinesDataService>();

        builder.Services.AddTransient<BusinessLogicServiceInterface.IPlinkoService, BusinessLogicService.PlinkoService>();
        builder.Services.AddScoped<DataAccessServiceInterface.IPlinkoDataService, DataAccessService.PlinkoDataService>();

        builder.Services.AddSingleton<BusinessLogicServiceInterface.ICrashGameStore, BusinessLogicService.GameState.CrashGameStore>();
        builder.Services.AddTransient<BusinessLogicServiceInterface.ICrashService, BusinessLogicService.CrashService>();
        builder.Services.AddScoped<DataAccessServiceInterface.ICrashDataService, DataAccessService.CrashDataService>();
        builder.Services.AddHostedService<WebSocketServicePoint.CrashGameWorker>();

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
        app.UseRouting();
        app.UseCors();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapHub<SystemHub>("/hub");
        app.MapHub<GameHub>("/game");
        app.MapControllers();
        app.Run();
    }
}
