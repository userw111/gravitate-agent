// Temporary implementation of the llmchat workflow worker hook.
// This is a minimal stub to satisfy imports; you can later replace this
// with the real worker-backed implementation if needed.

export type WorkflowResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

type WorkflowEventHandler = (data: any) => void;

export function useWorkflowWorker(onEvent?: WorkflowEventHandler) {
  async function startWorkflow(_args: unknown): Promise<WorkflowResult> {
    // TODO: integrate with your real workflow / agent system.
    // For now, immediately emit a "done" event so the UI can settle.
    if (onEvent) {
      onEvent({ type: "done" });
    }
    return { success: false, error: "Workflow worker not implemented yet." };
  }

  function abortWorkflow() {
    // In a real implementation, signal the worker to abort.
  }

  return { startWorkflow, abortWorkflow };
}

