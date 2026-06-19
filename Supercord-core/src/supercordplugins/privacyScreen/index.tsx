/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { ChannelToolbarButtonProps,HeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { Devs, SupercordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    privacyEnabled: {
        type: OptionType.BOOLEAN,
        description: "Is the privacy screen currently enabled?",
        default: false,
        restartNeeded: false,
        onChange: v => {
            if ((window as any).VencordNative && (window as any).VencordNative.native && (window as any).VencordNative.native.setContentProtection) {
                (window as any).VencordNative.native.setContentProtection(v);
            }
        }
    }
});

function Icon(props: any) {
    return (
        <svg viewBox="-2 -2 28 28" fill="currentColor" width="24" height="24" {...props}>
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
        </svg>
    );
}

function PrivacyToggleButton({ ...props }: ChannelToolbarButtonProps) {
    const { privacyEnabled } = settings.use(["privacyEnabled"]);

    return (
        <HeaderBarButton
            className={`privacy-button ${privacyEnabled ? "privacy-button-active" : ""}`}
            tooltip={privacyEnabled ? "Disable Privacy Screen" : "Enable Privacy Screen"}
            icon={Icon}
            iconSize={24}
            onClick={() => settings.store.privacyEnabled = !privacyEnabled}
            {...props}
        />
    );
}

export default definePlugin({
    name: "PrivacyScreen",
    description: "Adds a button to the top toolbar to toggle a privacy screen for screensharing.",
    tags: ["Privacy", "Shortcuts"],
    authors: [SupercordDevs.superior],
    dependencies: ["UserSettingsAPI", "HeaderBarAPI"],
    settings,

    start() {
        if (settings.store.privacyEnabled) {
            if ((window as any).VencordNative && (window as any).VencordNative.native && (window as any).VencordNative.native.setContentProtection) {
                (window as any).VencordNative.native.setContentProtection(true);
            }
        }
    },

    stop() {
        if ((window as any).VencordNative && (window as any).VencordNative.native && (window as any).VencordNative.native.setContentProtection) {
            (window as any).VencordNative.native.setContentProtection(false);
        }
    },

    headerBarButton: {
        render: PrivacyToggleButton
    }
});
