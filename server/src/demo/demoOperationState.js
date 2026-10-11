let mutationInProgress = false;

export function isDemoMutationInProgress() {
  return mutationInProgress;
}

export function beginDemoMutation() {
  if (mutationInProgress) {
    const error = new Error("Another demo data action is running.");
    error.status = 409;
    throw error;
  }
  mutationInProgress = true;
}

export function endDemoMutation() {
  mutationInProgress = false;
}
