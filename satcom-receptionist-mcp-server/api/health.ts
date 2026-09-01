import type { IncomingMessage, ServerResponse } from "node:http";

type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

export default function handler(_req: IncomingMessage, res: ApiResponse): void {
  res.status(200).json({ ok: true, server: "satcom-receptionist-mcp-server" });
}
