import { createSignal, For } from "solid-js";
import Dialog from "@corvu/dialog";

function CorvuDialogDemo() {
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [savedNotes, setSavedNotes] = createSignal<string[]>([]);
  const [localDraft, setLocalDraft] = createSignal("");
  const [localSavedNotes, setLocalSavedNotes] = createSignal<string[]>([]);

  const saveDraft = () => {
    const value = draft().trim();
    if (!value) return;
    setSavedNotes((prev) => [value, ...prev].slice(0, 5));
    setDraft("");
    setOpen(false);
  };

  const saveLocalDraft = () => {
    const value = localDraft().trim();
    if (!value) return;
    setLocalSavedNotes((prev) => [value, ...prev].slice(0, 5));
    setLocalDraft("");
  };

  return (
    <>
      <div class="demo-section corvu-demo">
        <strong>Corvu Dialog: Third-Party Controlled State</strong>
        <p class="hint">
          Dialog open state and input are owned by this app component, so they
          survive HMR.
        </p>

        <div class="controls">
          <button type="button" onClick={() => setOpen(true)}>
            Open controlled dialog
          </button>
          <span class="corvu-status">Open: {open() ? "yes" : "no"}</span>
        </div>

        <Dialog open={open()} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Overlay class="corvu-overlay" />
            <Dialog.Content class="corvu-content">
              <Dialog.Label class="corvu-title">Team Note</Dialog.Label>
              <Dialog.Description class="corvu-description">
                Type a note, save it, then edit a file and hot-reload to see
                state stay intact.
              </Dialog.Description>

              <input
                value={draft()}
                onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
                placeholder="draft note..."
              />

              <div class="corvu-actions">
                <Dialog.Close class="corvu-secondary">Cancel</Dialog.Close>
                <button type="button" class="corvu-primary" onClick={saveDraft}>
                  Save note
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>

        <ul class="item-list">
          <For each={savedNotes()}>{(note) => <li>{note}</li>}</For>
        </ul>
      </div>

      <div class="demo-section corvu-demo">
        <strong>Corvu Dialog: Uncontrolled Internal Open State</strong>
        <p class="hint">
          Open state is owned by Corvu internals here. Only this component's
          signals are persisted.
        </p>

        <Dialog>
          <Dialog.Trigger class="corvu-secondary">
            Open uncontrolled dialog
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay class="corvu-overlay" />
            <Dialog.Content class="corvu-content">
              <Dialog.Label class="corvu-title">Internal Open State</Dialog.Label>
              <Dialog.Description class="corvu-description">
                If this dialog is open during HMR, it is more likely to close
                because open state is internal.
              </Dialog.Description>

              <input
                value={localDraft()}
                onInput={(e) =>
                  setLocalDraft((e.target as HTMLInputElement).value)
                }
                placeholder="uncontrolled draft..."
              />

              <div class="corvu-actions">
                <Dialog.Close class="corvu-secondary">Close</Dialog.Close>
                <button
                  type="button"
                  class="corvu-primary"
                  onClick={saveLocalDraft}
                >
                  Save local note
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>

        <ul class="item-list">
          <For each={localSavedNotes()}>{(note) => <li>{note}</li>}</For>
        </ul>
      </div>
    </>
  );
}

export default CorvuDialogDemo;
