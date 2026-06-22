/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import { OptionType } from "@utils/types";
import { Button, GuildStore, React, TextInput, useStateFromStores } from "@webpack/common";

import { addIndicator, removeIndicator } from ".";
import { HiddenServersMenu } from "./components/HiddenServersMenu";
import { HiddenServersStore } from "./HiddenServersStore";

function HiddenServersManager() {
    const [input, setInput] = React.useState("");
    const hiddenGuildIds = useStateFromStores(
        [HiddenServersStore],
        () => Array.from(HiddenServersStore.hiddenGuilds).filter(id => !id.startsWith("folder-")),
        undefined,
        (old, newer) => old.length === newer.length && old.every((id, index) => id === newer[index])
    );

    function addIds() {
        const ids = input
            .split(/[,\s]+/)
            .map(id => id.trim())
            .filter(Boolean);

        for (const id of ids) HiddenServersStore.addHiddenGuild(id);
        setInput("");
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <TextInput
                    value={input}
                    onChange={setInput}
                    placeholder="Server ID, or multiple IDs separated by commas"
                />
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.PRIMARY}
                    disabled={!input.trim()}
                    onClick={addIds}
                >
                    Add
                </Button>
            </div>

            {hiddenGuildIds.length > 0 ? hiddenGuildIds.map(id => {
                const guild = GuildStore.getGuild(id);
                return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, background: "var(--background-secondary)" }}>
                        <div style={{ minWidth: 0 }}>
                            <BaseText size="sm">{guild?.name ?? "Unknown server"}</BaseText>
                            <BaseText size="sm" color="text-muted">{id}</BaseText>
                        </div>
                        <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => HiddenServersStore.removeHiddenGuild(id)}>
                            Remove
                        </Button>
                    </div>
                );
            }) : (
                <BaseText size="sm" color="text-muted">No hidden servers in the list.</BaseText>
            )}
        </div>
    );
}

export default definePluginSettings({
    showIndicator: {
        type: OptionType.BOOLEAN,
        description: "Show menu to unhide servers at the bottom of the list",
        default: true,
        onChange: val => {
            if (val) {
                addIndicator();
            } else {
                removeIndicator();
            }
        }
    },
    guildsList: {
        type: OptionType.COMPONENT,
        description: "Remove hidden servers",
        component: () => {
            const detail = useStateFromStores([HiddenServersStore], () => HiddenServersStore.hiddenGuildsDetail());
            return <HiddenServersMenu guilds={detail} />;
        }
    },
    hiddenServersManager: {
        type: OptionType.COMPONENT,
        description: "Add or remove hidden servers by ID",
        component: HiddenServersManager
    },
    resetHidden: {
        type: OptionType.COMPONENT,
        description: "Remove all hidden guilds from the list",
        component: () => (
            <div>
                <Button
                    size={Button.Sizes.SMALL}
                    color={Button.Colors.RED}
                    onClick={() => HiddenServersStore.clearHidden()}
                >
                    Reset Hidden Servers
                </Button>
            </div>
        ),
    },
});
