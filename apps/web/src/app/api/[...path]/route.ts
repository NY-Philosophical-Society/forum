import { apiApplication } from "~/server/api-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiApplication.handle.bind(apiApplication);
export const POST = apiApplication.handle.bind(apiApplication);
export const PUT = apiApplication.handle.bind(apiApplication);
export const PATCH = apiApplication.handle.bind(apiApplication);
export const DELETE = apiApplication.handle.bind(apiApplication);
