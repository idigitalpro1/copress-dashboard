import { z } from "zod";
import { DEPARTMENTS } from "../constants.js";

const departmentKeys = DEPARTMENTS.map((d) => d.key) as [string, ...string[]];

export const TakeMessageInputSchema = z
  .object({
    caller_name: z
      .string()
      .min(1, "Caller name is required")
      .max(120, "Caller name must not exceed 120 characters")
      .describe("The caller's full name as given on the call."),
    callback_number: z
      .string()
      .min(7, "Callback number looks too short")
      .max(32, "Callback number must not exceed 32 characters")
      .describe("Phone number to call the person back on, digits as spoken/given by the caller."),
    department: z
      .enum(departmentKeys)
      .describe(
        `Which department the message is for. One of: ${departmentKeys.join(", ")}. Use list_departments to see the full directory and criteria.`
      ),
    summary: z
      .string()
      .min(1, "Summary is required")
      .max(600, "Summary must not exceed 600 characters")
      .describe("One or two sentence summary of what the caller needs, in the caller's own words where possible."),
    urgent: z
      .boolean()
      .default(false)
      .describe("True only if the caller explicitly said this is urgent or time-sensitive.")
  })
  .strict();

export type TakeMessageInput = z.infer<typeof TakeMessageInputSchema>;
