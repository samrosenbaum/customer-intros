import {
  getResearchConfig,
  handleResearch,
} from "../../../server/research-handler";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export function GET() {
  return getResearchConfig();
}
export function POST(request: Request) {
  return handleResearch(request);
}
