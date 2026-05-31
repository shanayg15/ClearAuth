// Demo auth. ClearAuth strips Scalekit's 4-role routing — the whole demo runs
// as a single hardcoded doctor. Send `Authorization: Bearer demo_doctor` (any
// value, or none, also works in demo mode). validateToken always resolves to
// the demo doctor so no route ever 401s during the live demo.

export interface DemoUser {
  userId: string;
  name: string;
  role: "doctor";
}

export const DEMO_DOCTOR: DemoUser = {
  userId: "dr_demo",
  name: "Dr. Demo",
  role: "doctor",
};

export function validateToken(_authHeader: string | null): DemoUser {
  return DEMO_DOCTOR;
}
