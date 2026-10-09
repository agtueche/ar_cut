let guard: (() => Promise<boolean>) | null = null;
export function setStudioNavigationGuard(next: (() => Promise<boolean>) | null) { guard = next; }
export async function allowStudioNavigation() { return guard ? guard() : true; }
