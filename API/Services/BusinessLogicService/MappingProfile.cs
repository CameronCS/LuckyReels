using AutoMapper;
using DatabaseEntities;
using Models;

namespace BusinessLogicService; 
public class MappingProfile : Profile {
    public MappingProfile() {
        CreateMap<UsrAdmin, Admin>().ReverseMap().MaxDepth(10);
        CreateMap<UsrPlayer, Player>().ReverseMap().MaxDepth(10);
        CreateMap<ErrError, Error>().ReverseMap().MaxDepth(10);

    }
}
