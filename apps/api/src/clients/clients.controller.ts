import{Body,Controller,Delete,Get,Param,Patch,Post}from'@nestjs/common';
import{TenantId}from'../common/decorators/tenant.decorator';
import{ClientsService}from'./clients.service';
import{ClientDto}from'./dto/client.dto';

@Controller('clients')
export class ClientsController{
  constructor(private s:ClientsService){}

  @Get()
  list(@TenantId()t:string){return this.s.list(t)}

  @Get(':id')
  one(@TenantId()t:string,@Param('id')i:string){return this.s.one(t,i)}

  @Get(':id/history')
  history(@TenantId()t:string,@Param('id')i:string){return this.s.history(t,i)}

  @Post()
  create(@TenantId()t:string,@Body()d:ClientDto){return this.s.create(t,d)}

  @Patch(':id')
  update(@TenantId()t:string,@Param('id')i:string,@Body()d:Partial<ClientDto>){return this.s.update(t,i,d)}

  @Delete(':id')
  delete(@TenantId()t:string,@Param('id')i:string){return this.s.remove(t,i)}
}