/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { registerCommands } from "../api/registry";
import { loadCustomCommands, registerCustomCommands } from "./custom";
import { discordCommands } from "./discordActions";
import { supercordCommands } from "./supercord";
import { navigationCommands } from "./navigation";
import { pluginCommands } from "./pluginManagement";
import { sendDmCommand } from "./sendDm";

export async function registerBuiltinCommands() {
    registerCommands("CommandPalette.builtin", [
        ...navigationCommands,
        ...discordCommands,
        ...pluginCommands,
        ...supercordCommands,
        sendDmCommand
    ]);

    await loadCustomCommands();
    registerCustomCommands();
}
