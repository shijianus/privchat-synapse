export interface PendingMessage {
  readonly id: number;
  readonly userId: number;
  readonly synapseUserId: string;
  readonly roomId: string;
  readonly senderMatrixId: string;
  readonly eventType: string;
  readonly content: unknown;
  readonly mediaHash?: string | null;
  readonly receivedAt: string;
  readonly synced: boolean;
  readonly syncedAt?: string | null;
  readonly failureReason?: string | null;
}

export interface PendingMessageFilters {
  readonly synced?: boolean;
  readonly synapseUserId?: string;
  readonly roomId?: string;
  readonly senderMatrixId?: string;
}

export interface MessageSyncActionResult {
  readonly success: boolean;
  readonly messageId: number;
  readonly action: 'replay' | 'discard';
  readonly syncedAt?: string | null;
}
