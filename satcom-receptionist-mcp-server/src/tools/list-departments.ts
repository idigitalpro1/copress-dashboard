import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEPARTMENTS } from "../constants.js";

export function registerListDepartmentsTool(server: McpServer): void {
  server.registerTool(
    "list_departments",
    {
      title: "List Departments",
      description: `Return the CoNews/SATCOM network department directory: names, SIP extensions, and when to route a caller to each one.

Call this before transferring a call or taking a message if you are not certain which department fits the caller's request. This does NOT place or transfer a call — transfers happen through the agent's own Transfer to Human tool, using the sip_uri returned here as the target.

Returns:
  Structured data: { departments: [{ key, name, extension, sip_uri, use_when }] }`,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () => {
      const output = {
        departments: DEPARTMENTS.map((d) => ({
          key: d.key,
          name: d.name,
          extension: d.extension,
          sip_uri: d.sipUri,
          use_when: d.useWhen
        }))
      };

      const lines = ["# CoNews / SATCOM Network Directory", ""];
      for (const d of DEPARTMENTS) {
        lines.push(`- **${d.name}** (ext ${d.extension}, key "${d.key}") — ${d.useWhen}`);
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        structuredContent: output
      };
    }
  );
}
