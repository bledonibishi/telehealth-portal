import { Controller, Get, Header, Query } from '@nestjs/common';
import { LeadRemindersService } from './lead-reminders.service';

const page = (title: string, message: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
  `<body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#0E1A2B"><h1 style="font-size:22px">${title}</h1><p style="color:#475569;line-height:1.6">${message}</p></body></html>`;

@Controller('leads')
export class LeadRemindersController {
  constructor(private reminders: LeadRemindersService) {}

  // Opened from the link in a reminder email. Public on purpose: the signature in the link is the proof.
  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async unsubscribe(@Query('lead') lead: string, @Query('sig') sig: string) {
    return (await this.reminders.unsubscribe(lead, sig))
      ? page('You won’t get any more reminders', 'We’ve stopped the reminder emails for this address.')
      : page('This link doesn’t work', 'It may have been copied incompletely. Reply to the email and we’ll stop the reminders for you.');
  }
}
