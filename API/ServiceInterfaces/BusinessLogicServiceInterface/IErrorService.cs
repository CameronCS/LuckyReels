using Models;

namespace BusinessLogicServiceInterface; 
public interface IErrorService {
    Task AddError(Error error, CancellationToken cancellationToken = default);
    Task<IEnumerable<Error>> GetAllErrors(CancellationToken cancellationToken = default);
}
