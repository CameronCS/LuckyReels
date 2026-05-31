namespace DataAccessServiceInterface; 
public interface IBaseDataLayerService {
    public Task<int> SaveChangesAsync(int? timeout);
}
