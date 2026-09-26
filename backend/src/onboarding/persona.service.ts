import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PersonaStatus } from '../common/enums';

/**
 * Wraps identity verification so the rest of the app never has to know whether
 * Persona is actually configured. Without PERSONA_API_KEY, verification is
 * skipped and routed to manual clinician review instead of blocking onboarding.
 */
@Injectable()
export class PersonaService {
  private readonly logger = new Logger(PersonaService.name);

  constructor(private config: ConfigService) {}

  get isConfigured(): boolean {
    return !!this.config.get<string>('PERSONA_API_KEY');
  }

  async verifyIdentity(_patientId: string, _idDocumentFileId: string, _selfieFileId: string): Promise<PersonaStatus> {
    if (!this.isConfigured) {
      this.logger.warn('PERSONA_API_KEY not set — skipping identity verification, routing to manual review');
      return PersonaStatus.NOT_CONFIGURED;
    }

    // TODO: call the real Persona API (create inquiry, poll/verify result) once
    // PERSONA_API_KEY and a template ID are available.
    return PersonaStatus.PENDING;
  }
}
