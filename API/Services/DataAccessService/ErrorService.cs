using DataAccessServiceInterface;
using DatabaseEntities;
using Microsoft.EntityFrameworkCore;
using SystemFramework.Security;

namespace DataAccessService {
    public class ErrorService(App_DBContext dBContext, ActiveTenantService activeTenantService) : BaseDataService(dBContext, activeTenantService), IErrorService {
        public async Task AddError(ErrError error, CancellationToken cancellationToken = default) {
            await _context.ErrErrors.AddAsync(error, cancellationToken);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task<IEnumerable<ErrError>> GetAllErrors(CancellationToken cancellationToken) {
            IEnumerable<ErrError> errors = await _context.ErrErrors.ToListAsync(cancellationToken);
            return errors;
        }
    }
}
