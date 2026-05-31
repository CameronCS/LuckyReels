using BusinessLogicServiceInterface;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Models;
using System.Text;
using SystemFramework.Security;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace SystemFramework.Exceptions;

public partial class ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger) {
    // Source-generated logging methods
    [LoggerMessage(Level = LogLevel.Debug, Message = "Request was cancelled: {Path}")]
    private static partial void LogRequestCancelled(ILogger logger, string path);

    [LoggerMessage(Level = LogLevel.Information, Message = "Exception logged to database: {ExceptionType}")]
    private static partial void LogExceptionLogged(ILogger logger, string exceptionType);

    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to log exception to database. Original exception: {OriginalException}")]
    private static partial void LogDatabaseFailure(ILogger logger, Exception dbEx, string originalException);

    public async Task InvokeAsync(HttpContext context, IErrorService errorService, ActiveTenantService activeTenantService) {
        try {
            await next(context);
        } catch (Exception ex) {
            await LogExceptionToDatabase(ex, context, errorService, activeTenantService, logger);
            throw;
        }
    }

    private static async Task LogExceptionToDatabase(Exception ex, HttpContext httpContext, IErrorService errorService, ActiveTenantService activeTenantService, ILogger logger) {

        if (ex is TaskCanceledException or OperationCanceledException) {
            string path = httpContext.Request.Path;
            LogRequestCancelled(logger, path);
            return;
        }

        try {
            Models.Error error = new() {
                Date = DateTime.UtcNow,
                Exception = BuildExceptionMessage(ex),
                Message = ex.GetType().Name,
                Host = httpContext.Request.Host.Host,
                Uri = httpContext.Request.Path,
            };

            await errorService.AddError(error);
            string exceptionName = ex.GetType().Name;
            LogExceptionLogged(logger, exceptionName);
        } catch (Exception dbEx) {
            LogDatabaseFailure(logger, dbEx, ex.Message);
        }
    }

    private static string BuildExceptionMessage(Exception ex) {
        StringBuilder sb = new();
        sb.AppendLine($"Message: {ex.Message}");
        sb.AppendLine($"Stack Trace: {ex.StackTrace}");
        if (ex.InnerException != null) {
            sb.AppendLine($"Inner Exception: {ex.InnerException.Message}");
            sb.AppendLine($"Inner Stack Trace: {ex.InnerException.StackTrace}");
        }
        return sb.ToString();
    }
}
