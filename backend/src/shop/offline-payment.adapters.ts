import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopPaymentProvider } from '@prisma/client';
import type { PaymentStart, PaymentStartInput, PaymentState, ShopPaymentAdapter } from './payment-provider';

/**
 * Ways of paying that happen away from the website, recorded by staff (Shop → Orders → "Payment received"). Nothing
 * is opened with a provider: the buyer goes straight to their order page, which says what to do.
 */
abstract class OfflineAdapter implements ShopPaymentAdapter {
  abstract readonly key: ShopPaymentProvider;
  readonly kind = 'OFFLINE' as const;
  abstract readonly label: string;
  abstract readonly description: string;
  abstract isConfigured(): boolean;

  async start(input: PaymentStartInput): Promise<PaymentStart> {
    return { providerOrderId: `${this.key.toLowerCase()}-${input.paymentId}`, redirectUrl: input.urls.success };
  }

  // Nobody to ask: staff record the payment when it arrives.
  async status(): Promise<PaymentState> {
    return { status: 'PENDING' };
  }

  // The money goes back by hand (cash, or a transfer to the buyer); this only gives the record its id.
  async refund(payment: { providerOrderId: string }): Promise<string> {
    return `manual-${payment.providerOrderId}-${Date.now()}`;
  }
}

/** Paid to the courier, in cash or by card on their terminal, when the parcel arrives. */
@Injectable()
export class CashOnDeliveryAdapter extends OfflineAdapter {
  readonly key = ShopPaymentProvider.COD;
  readonly label = 'Pay on delivery';
  readonly description = 'In cash, or by card on the courier’s terminal.';

  isConfigured(): boolean {
    return true;
  }
}

/** Paid into our bank account. Offered once SHOP_BANK_IBAN and SHOP_BANK_ACCOUNT_NAME are set. */
@Injectable()
export class BankTransferAdapter extends OfflineAdapter {
  readonly key = ShopPaymentProvider.BANK_TRANSFER;
  readonly label = 'Bank transfer';
  readonly description = 'For businesses, or accounts that can’t pay by card. We send your order once the money arrives.';

  constructor(private config: ConfigService) {
    super();
  }

  isConfigured(): boolean {
    return Boolean(this.details());
  }

  /** What the buyer needs to make the transfer. */
  details(): { iban: string; accountName: string; bankName: string | null } | null {
    const iban = this.config.get<string>('SHOP_BANK_IBAN')?.replace(/\s+/g, '');
    const accountName = this.config.get<string>('SHOP_BANK_ACCOUNT_NAME')?.trim();
    if (!iban || !accountName) return null;
    return { iban, accountName, bankName: this.config.get<string>('SHOP_BANK_NAME')?.trim() || null };
  }
}
