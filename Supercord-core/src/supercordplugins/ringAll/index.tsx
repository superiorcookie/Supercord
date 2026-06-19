/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { SupercordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, React, RestAPI, Tooltip, UserStore, VoiceStateStore } from "@webpack/common";

const settings = definePluginSettings({
    showInVoicePanel: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show Ring All next to the voice panel call buttons"
    }
});

let cooldown = false;
const listeners = new Set<() => void>();

function emitChange() {
    for (const listener of listeners) listener();
}

function RingIcon({ size = 20 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-5v-5.2a7 7 0 0 0-5-6.7V4a2 2 0 1 0-4 0v1.1a7 7 0 0 0-5 6.7V17l-2 2v1h18v-1l-2-2Zm-2.2 1H7.2l.8-.8v-5.4a4 4 0 1 1 8 0v5.4l.8.8Z" />
        </svg>
    );
}

function getCurrentVoiceChannelId() {
    const userId = UserStore.getCurrentUser()?.id;
    return userId ? VoiceStateStore.getVoiceStateForUser(userId)?.channelId : null;
}

async function ringAll(channelId: string) {
    if (cooldown) return;

    cooldown = true;
    emitChange();

    try {
        await RestAPI.post({
            url: `/channels/${channelId}/call/ring`,
            body: {
                recipients: ["1"],
                analytics_location: "voice_panel"
            }
        });
    } finally {
        setTimeout(() => {
            cooldown = false;
            emitChange();
        }, 5000);
    }
}

function RingAllButton() {
    const [, rerender] = React.useReducer(value => value + 1, 0);
    const channelId = getCurrentVoiceChannelId();

    React.useEffect(() => {
        listeners.add(rerender);
        return () => void listeners.delete(rerender);
    }, []);

    if (!channelId) return null;

    return (
        <Tooltip text={cooldown ? "Ring All cooldown" : "Ring Everyone"}>
            {tooltipProps => (
                <Button
                    {...tooltipProps}
                    size={Button.Sizes.MIN}
                    color={Button.Colors.TRANSPARENT}
                    look={Button.Looks.FILLED}
                    disabled={cooldown}
                    onClick={() => void ringAll(channelId)}
                    style={{
                        width: 32,
                        height: 32,
                        minWidth: 32,
                        padding: 0,
                        marginLeft: 8,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}
                >
                    <RingIcon />
                </Button>
            )}
        </Tooltip>
    );
}

export default definePlugin({
    name: "RingAll",
    description: "Adds a Ring Everyone button to the connected voice panel.",
    tags: ["Voice", "Utility"],
    authors: [SupercordDevs.fries],
    settings,
    enabledByDefault: true,

    patches: [
        {
            find: "}getAccessibilityLabel(){",
            predicate: () => settings.store.showInVoicePanel,
            replacement: {
                match: /(this\.renderVoiceStates\(\),)(\i)/,
                replace: "$1 [$self.renderRingButton(), $2]"
            }
        }
    ],

    renderRingButton() {
        return <RingAllButton key="ring-all-button" />;
    }
});
