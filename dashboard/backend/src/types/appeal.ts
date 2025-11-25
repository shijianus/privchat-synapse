export type AppealStatus = 'pending' | 'accepted' | 'rejected';

export interface UserAppeal {
  readonly id: number;
  readonly userId: number;
  readonly synapseUserId: string;
  readonly banId?: number | null;
  readonly contactEmail?: string | null;
  readonly contactMatrix?: string | null;
  readonly reason: string;
  readonly status: AppealStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AppealMessage {
  readonly id: number;
  readonly appealId: number;
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
}

export interface AppealDetail extends UserAppeal {
  readonly messages: AppealMessage[];
}

export interface AppealListFilters {
  readonly status?: AppealStatus;
  readonly synapseUserId?: string;
  readonly limit?: number;
}

export interface AppealSubmissionRequest {
  readonly synapseUserId: string;
  readonly banId?: number;
  readonly contactEmail?: string | null;
  readonly contactMatrix?: string | null;
  readonly reason: string;
  readonly message?: string;
}

export interface AppealMessageRequest {
  readonly body: string;
  readonly authorLabel?: string;
}

export interface AppealDecisionRequest {
  readonly status: Exclude<AppealStatus, 'pending'>;
  readonly responseMessage?: string;
}
