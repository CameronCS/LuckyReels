using DatabaseEntities;

namespace DataAccessServiceInterface; 
public interface IErrorService : IBaseDataLayerService {
    public Task AddError(ErrError error, CancellationToken cancellationToken = default);
    public Task<IEnumerable<ErrError>> GetAllErrors(CancellationToken cancellationToken);
}
