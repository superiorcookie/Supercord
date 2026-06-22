/*
 * Spam Plugin for Supercord
 * Adds a button next to the gift button that lets you spam messages in the
 * current channel (group, DM or guild) with a configurable amount and delay.
 * Includes built-in rate limit handling for up to 100 messages.
 *
 * Copyright (c) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { openModal } from "@webpack/common";

import { isSpamming, stopSpamming } from "./spammer";
import { SpamModal } from "./SpamModal";

export const settings = definePluginSettings({
    defaultMessage: {
        type: OptionType.STRING,
        description: "The default message content to spam",
        default: "h",
    },
    defaultCount: {
        type: OptionType.SLIDER,
        description: "Default number of messages to send (max 100)",
        markers: [1, 10, 25, 50, 75, 100],
        default: 10,
        stickToMarkers: false,
    },
    defaultDelay: {
        type: OptionType.SLIDER,
        description: "Default delay between messages in milliseconds (lower = faster, but riskier for rate limits)",
        markers: [0, 250, 500, 1000, 2000],
        default: 500,
        stickToMarkers: false,
    },
    showIcon: {
        type: OptionType.BOOLEAN,
        description: "Show the spam button in the chat bar",
        default: true,
        restartNeeded: true,
    },
});

function SpamIcon(props: { enabled?: boolean; }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
                fill={props.enabled ? "var(--status-danger)" : "currentColor"}
                d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7.414l-3.707 3.707A1 1 0 0 1 2 21V4Zm5 4a1 1 0 0 0 0 2h10a1 1 0 1 0 0-2H7Zm0 4a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z"
            />
        </svg>
    );
}

const SpamButton: ChatBarButtonFactory = ({ isMainChat }) => {
    if (!isMainChat || !settings.store.showIcon) return null;

    return (
        <ChatBarButton
            tooltip={isSpamming() ? "Spamming... (click to manage)" : "Spam Messages"}
            onClick={() => openModal(props => <SpamModal rootProps={props} />)}
        >
            <SpamIcon enabled={isSpamming()} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "SpamPlugin",
    description: "Adds a button next to the gift button to spam messages in the current channel, group or DM with rate limit handling (up to 100).",
    authors: [{ name: "Supercord User", id: 0n }],
    dependencies: ["ChatInputButtonAPI"],
    tags: ["Chat", "Fun", "Utility"],
    settings,

    chatBarButton: {
        icon: () => <SpamIcon />,
        render: SpamButton,
    },

    stop() {
        // Make sure any active spam loop is stopped when the plugin is disabled
        stopSpamming();
    },
});
