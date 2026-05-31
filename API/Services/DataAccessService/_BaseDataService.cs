using DatabaseEntities;
using Microsoft.EntityFrameworkCore;
using SystemFramework.Security;

namespace DataAccessService; 
public class BaseDataService(App_DBContext context, ActiveTenantService activeTenantService) {
    protected App_DBContext _context = context;
    protected ActiveTenantService _activeTenantService = activeTenantService;

    public async Task<int> SaveChangesAsync(int? timeout = null) {
        if (timeout.HasValue) {
            _context.Database.SetCommandTimeout(timeout);
        }
        return await _context.SaveChangesAsync();
    }
}
