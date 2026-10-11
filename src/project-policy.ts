import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { messages } from "./messages.js";

/** pi's built-in /trust runs before extension commands and input events. */
export function projectPolicyExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new CustomEditor(tui, theme, keybindings);
      // pi installs/replaces onSubmit when changing editors. Guard that boundary,
      // not a particular keystroke: remaps and programmatic calls use it too.
      let submit: typeof editor.onSubmit;
      Object.defineProperty(editor, "onSubmit", {
        configurable: true,
        get: () => (text: string) => {
          if (/^\/trust(?:\s|$)/.test(text.trim())) {
            editor.setText("");
            ctx.ui.notify(messages.ui.projectSettingsDisabled, "info");
            return;
          }
          return submit?.(text);
        },
        set: (callback: typeof editor.onSubmit) => { submit = callback; },
      });
      return editor;
    });
    ctx.ui.addAutocompleteProvider(current => ({
      ...(current.triggerCharacters ? { triggerCharacters: current.triggerCharacters } : {}),
      async getSuggestions(...args) {
        const suggestions = await current.getSuggestions(...args);
        return suggestions ? { ...suggestions, items: suggestions.items.filter(item => item.value !== "trust" && item.value !== "/trust") } : null;
      },
      applyCompletion: (...args) => current.applyCompletion(...args),
      shouldTriggerFileCompletion: (...args) => current.shouldTriggerFileCompletion?.(...args) ?? false,
    }));
  });
}
