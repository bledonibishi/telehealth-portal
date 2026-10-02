import { BadRequestException, Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { DeviceReadingsService, IncomingReading, IngestResult, MAX_READINGS_PER_REQUEST } from './device-readings.service';
import { deviceTokenFrom } from './device-token';

/**
 * Where a smart scale, or the mobile app relaying Apple Health / Google Fit, sends weights.
 * See README.md. The caller authenticates with a device token the patient created — not a login
 * token — and can only ever write weights for that one patient.
 */
@Controller('integrations')
export class DeviceReadingsController {
  constructor(private readings: DeviceReadingsService) {}

  @Post('weights')
  @HttpCode(200)
  async ingest(@Headers('authorization') authorization: string | undefined, @Body() body: { readings?: IncomingReading[] }): Promise<IngestResult> {
    const auth = await this.readings.authenticate(deviceTokenFrom(authorization));
    const readings = body?.readings;
    if (!Array.isArray(readings) || readings.length === 0) throw new BadRequestException('Send { "readings": [ … ] } with at least one reading');
    if (readings.length > MAX_READINGS_PER_REQUEST) throw new BadRequestException(`Send at most ${MAX_READINGS_PER_REQUEST} readings at a time`);
    return this.readings.ingest(auth, readings);
  }
}
