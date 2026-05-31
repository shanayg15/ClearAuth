"use client";

// Demo session. ClearAuth runs as a single hardcoded doctor (Scalekit's role
// routing is stripped for the demo), so this is static — no cookie, no fetch.

export interface Session {
  userId: string;
  name: string;
  role: string;
}

const DEMO_SESSION: Session = {
  userId: "dr_demo",
  name: "Dr. Demo",
  role: "doctor",
};

export function useSession() {
  return { session: DEMO_SESSION };
}
