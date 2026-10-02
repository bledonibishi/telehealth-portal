import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Authorized } from '../auth/decorators/authorized.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/access-roles';
import { DeviceConnectionsService } from './device-connections.service';
import { CreateDeviceConnectionInput, CreatedDeviceConnectionModel, DeviceConnectionModel } from './models/device-connection.model';

@Resolver()
export class DeviceConnectionsResolver {
  constructor(private connections: DeviceConnectionsService) {}

  // A patient only ever manages their own connections: the id comes from the token, never an argument.
  @Authorized('PATIENT')
  @Mutation(() => CreatedDeviceConnectionModel, { description: 'Allow a device or health app to send your weight. The token in the answer is shown only once.' })
  createDeviceConnection(@CurrentUser() user: AuthUser, @Args('input') input: CreateDeviceConnectionInput) {
    return this.connections.create(user.id, input);
  }

  @Authorized('PATIENT')
  @Query(() => [DeviceConnectionModel])
  myDeviceConnections(@CurrentUser() user: AuthUser) {
    return this.connections.list(user.id);
  }

  @Authorized('PATIENT')
  @Mutation(() => DeviceConnectionModel, { description: 'Stop a device or app sending your weight. Weights it already sent are kept.' })
  revokeDeviceConnection(@CurrentUser() user: AuthUser, @Args('id', { type: () => ID }) id: string) {
    return this.connections.revoke(user.id, id);
  }
}
