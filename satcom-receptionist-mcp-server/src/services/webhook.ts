import axios from "axios";
import type { TakenMessage, WebhookDeliveryResult } from "../types.js";

/**
 * Forwards a taken message to the operator-configured intake webhook
 * (e.g. an n8n workflow, matching the pattern already used by
 * co-sportsbook-bonuses.html). Never throws — a delivery failure is
 * reported back to the caller (the agent) as data, not an exception,
 * so the receptionist can tell the human caller the truth about whether
 * the message actually reached anyone.
 */
export async function deliverMessage(message: TakenMessage): Promise<WebhookDeliveryResult> {
  const url = process.env.MESSAGE_WEBHOOK_URL;

  if (!url) {
    console.error("MESSAGE_WEBHOOK_URL is not set — message was not delivered anywhere.");
    return { delivered: false, error: "MESSAGE_WEBHOOK_URL is not configured on the server." };
  }

  try {
    const response = await axios.post(url, message, { timeout: 10_000 });
    return { delivered: true, status: response.status };
  } catch (error) {
    const detail = axios.isAxiosError(error)
      ? error.response
        ? `webhook returned ${error.response.status}`
        : error.message
      : "unknown error";
    console.error(`Failed to deliver message to MESSAGE_WEBHOOK_URL: ${detail}`);
    return { delivered: false, error: detail };
  }
}
