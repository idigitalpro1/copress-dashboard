import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEPARTMENTS } from "../constants.js";
import { TakeMessageInputSchema, type TakeMessageInput } from "../schemas/take-message.js";
import { deliverMessage } from "../services/webhook.js";
import type { TakenMessage } from "../types.js";

export function registerTakeMessageTool(server: McpServer): void {
  server.registerTool(
    "take_message",
    {
      title: "Take A Message",
      description: `Record a phone message for one of the CoNews/SATCOM network departments when the caller could not be transferred, or preferred not to hold.

Use this only after a transfer has been attempted or declined, and only after you have asked the caller for their name, a callback number, and a short summary of what they need. Do not use it to store anything other than a callback message — no payment details, no account passwords.

Args:
  - caller_name (string): The caller's name as given.
  - callback_number (string): Number to call them back on.
  - department (enum): One of ${DEPARTMENTS.map((d) => `"${d.key}"`).join(", ")}. Call list_departments first if unsure which one fits.
  - summary (string): One or two sentence summary of the request, in the caller's words where possible.
  - urgent (boolean): true only if the caller explicitly said this is urgent.

Returns:
  Confirmation text plus structured data: { delivered: boolean, department: string, taken_at: string }.
  When delivered is false, tell the caller their message was NOT successfully logged and offer the department's direct extension instead — do not claim it was received.

Error Handling:
  This tool never throws. A failed delivery comes back as delivered: false with an error reason so you can be honest with the caller instead of ending the call on a false confirmation.`,
      inputSchema: TakeMessageInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: TakeMessageInput) => {
      const department = DEPARTMENTS.find((d) => d.key === params.department);
      if (!department) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: unknown department "${params.department}". Call list_departments to see valid values.`
            }
          ]
        };
      }

      const message: TakenMessage = {
        caller_name: params.caller_name,
        callback_number: params.callback_number,
        department: department.key,
        summary: params.summary,
        urgent: params.urgent,
        taken_at: new Date().toISOString()
      };

      const result = await deliverMessage(message);

      const output = {
        delivered: result.delivered,
        department: department.key,
        department_name: department.name,
        taken_at: message.taken_at,
        ...(result.error ? { error: result.error } : {})
      };

      const text = result.delivered
        ? `Message logged for ${department.name} (ext ${department.extension}). Confirm the details back to the caller before ending the call.`
        : `Message was NOT delivered (${result.error}). Tell the caller it was not received and offer ${department.name}'s direct extension (${department.extension}) instead.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: output
      };
    }
  );
}
