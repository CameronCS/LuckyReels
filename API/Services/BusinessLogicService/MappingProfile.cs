using AutoMapper;
using DatabaseEntities;
using Models;

namespace BusinessLogicService; 
public class MappingProfile : Profile {
    public MappingProfile() {
        CreateMap<UsrAdmin, Admin>().ReverseMap().MaxDepth(10);
        CreateMap<UsrPlayer, Player>().ReverseMap().MaxDepth(10);
        CreateMap<UsrSession, Session>().ReverseMap().MaxDepth(10);
        CreateMap<ErrError, Error>().ReverseMap().MaxDepth(10);
        CreateMap<LogAdmin, AdminLog>().ReverseMap().MaxDepth(10);
        CreateMap<LogSpin, SpinLog>().ReverseMap().MaxDepth(10);
        CreateMap<LogBlackjack, BlackjackLog>().ReverseMap().MaxDepth(10);
        CreateMap<LogRoulette, RouletteLog>().ReverseMap().MaxDepth(10);
        CreateMap<LogHorse, HorseLog>().ReverseMap().MaxDepth(10);
        CreateMap<LogBaccarat, BaccaratLog>().ReverseMap().MaxDepth(10);
    }
}
