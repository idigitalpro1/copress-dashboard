export interface TakenMessage {
  caller_name: string;
  callback_number: string;
  department: string;
  summary: string;
  urgent: boolean;
  taken_at: string;
}

export interface WebhookDeliveryResult {
  delivered: boolean;
  status?: number;
  error?: string;
}
