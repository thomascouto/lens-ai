import { commands, type ExtensionContext, window } from "vscode";

import {
  ConfigsTreeProvider,
  EnginesTreeProvider,
  RulesTreeProvider,
} from "./providers/TreeDataProvider";
import { createOrShow } from "./providers/WebviewProvider";

export function activate(context: ExtensionContext): void {
  const enginesProvider = new EnginesTreeProvider();
  const configsProvider = new ConfigsTreeProvider();
  const rulesProvider = new RulesTreeProvider();

  context.subscriptions.push(
    window.registerTreeDataProvider("lens-engines", enginesProvider),
    window.registerTreeDataProvider("lens-configs", configsProvider),
    window.registerTreeDataProvider("lens-rules", rulesProvider),
  );

  context.subscriptions.push(
    commands.registerCommand("lens.openMatrix", () => {
      createOrShow(context.extensionUri);
    }),

    commands.registerCommand("lens.refresh", () => {
      enginesProvider.refresh();
      configsProvider.refresh();
      rulesProvider.refresh();
      window.showInformationMessage("Lens AI: Refreshed.");
    }),
  );

  rulesProvider.refresh();
}

export function deactivate(): void {
  // nothing to clean up
}
