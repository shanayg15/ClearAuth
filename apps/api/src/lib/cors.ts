import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  // local dev
  "http://localhost:3003", // dashboard
  "http://localhost:3009", // payer-portal (mock insurer form)
  // production (env vars override / extend)
  process.env.DASHBOARD_APP_URL,
  process.env.PAYER_PORTAL_URL,
].filter(Boolean) as string[];

export function corsHeaders(origin: string | null) {
  // Allow if origin matches, or allow all for requests with no origin (server-to-server)
  const isAllowed = !origin || ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? (origin ?? "*") : "",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function corsResponse(origin: string | null) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}
