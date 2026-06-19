/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { SupercordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { Button, React, ReactDOM, RestAPI, Tooltip, UserStore, VoiceStateStore } from "@webpack/common";

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
    const ref = React.useRef<HTMLDivElement>(null);
    const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);

    React.useEffect(() => {
        listeners.add(rerender);
        return () => void listeners.delete(rerender);
    }, []);

    React.useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        const findTarget = () => {
            if (portalTarget && document.contains(portalTarget)) return;
            
            const tabs = document.querySelectorAll('[role="tab"]');
            let privacyTab: HTMLElement | null = null;
            for (const tab of Array.from(tabs)) {
                if (tab.id.toLowerCase().includes('privacy') || tab.textContent?.toLowerCase().includes('privacy')) {
                    privacyTab = tab as HTMLElement;
                    break;
                }
            }
            
            if (privacyTab && privacyTab.parentElement) {
                let wrapper = privacyTab.previousElementSibling as HTMLElement;
                if (!wrapper || wrapper.id !== 'ring-all-wrapper') {
                    wrapper = document.createElement('div');
                    wrapper.id = 'ring-all-wrapper';
                    wrapper.style.display = 'flex';
                    wrapper.style.alignItems = 'center';
                    wrapper.style.marginRight = '8px'; // Add some spacing between the button and "Privacy"
                    privacyTab.parentElement.insertBefore(wrapper, privacyTab);
                }
                setPortalTarget(wrapper);
            } else if (portalTarget) {
                setPortalTarget(null);
            }
        };

        findTarget();
        interval = setInterval(findTarget, 200); // Poll fast so it injects smoothly when popup opens
        return () => clearInterval(interval);
    }, [portalTarget]);

    if (!channelId) return null;

    if (!portalTarget) {
        return <div ref={ref} style={{ display: 'none' }} />;
    }

    return ReactDOM.createPortal(
        <Tooltip text={cooldown ? "Ring All cooldown" : "Ring Everyone"}>
            {tooltipProps => (
                <Button
                    {...tooltipProps}
                    size={Button.Sizes.MIN}
                    color={Button.Colors.TRANSPARENT}
                    look={Button.Looks.BLANK}
                    disabled={cooldown}
                    onClick={() => void ringAll(channelId)}
                    style={{
                        width: 24,
                        height: 24,
                        minWidth: 24,
                        padding: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center"
                    }}
                >
                    <RingIcon />
                </Button>
            )}
        </Tooltip>,
        portalTarget
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
            find: '"RTCConnectionMenu"',
            predicate: () => settings.store.showInVoicePanel,
            replacement: {
                match: /("RTCConnectionMenu".{0,200}?lineClamp:1,children:)(\i)(?=,|}\))/,
                replace: "$1[$2, $self.renderRingButton()]"
            }
        }
    ],

    renderRingButton() {
        return <RingAllButton key="ring-all-button" />;
    }
});
