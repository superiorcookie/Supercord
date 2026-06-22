/*
 * Supercord, a Discord client mod
 * Copyright (c) 2025 Supercord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { findStoreLazy } from "@webpack";
import { Menu, React } from "@webpack/common";

const logger = new Logger("FakeStatus");

// Discord's PresenceStore exposes getStatus(userId) -> "online" | "idle" | "dnd" | "offline".
// We wrap it so selected users render a status of our choosing, purely on this client.
const PresenceStore = findStoreLazy("PresenceStore") as any;

const STORE_KEY = "FakeStatus_overrides";

// userId -> discord status string
let overrides: Record<string, string> = {};
let originalGetStatus: ((userId: string, ...args: any[]) => string) | null = null;

// "Invisible" for another user is indistinguishable from "offline" client-side,
// so we map it to "offline".
const STATUS_OPTIONS = [
    { key: "online", label: "Online" },
    { key: "idle", label: "Idle" },
    { key: "dnd", label: "Do Not Disturb" },
    { key: "offline", label: "Invisible" }
] as const;

function persist() {
    DataStore.set(STORE_KEY, overrides).catch(e => logger.error("Failed to persist overrides", e));
}

function refresh() {
    // Force any status indicators to re-read from the store.
    try {
        PresenceStore?.emitChange?.();
    } catch (e) {
        logger.error("Failed to emit store change", e);
    }
}

function setOverride(userId: string, status: string) {
    overrides[userId] = status;
    persist();
    refresh();
}

function clearOverride(userId: string) {
    delete overrides[userId];
    persist();
    refresh();
}

function patchedGetStatus(this: any, userId: string, ...args: any[]) {
    const override = overrides[userId];
    if (override) return override;
    return originalGetStatus!.apply(this, [userId, ...args]);
}

// The user's true status, ignoring any local override we applied.
function getRealStatus(userId: string): string {
    try {
        const fn = originalGetStatus ?? PresenceStore.getStatus;
        return fn.call(PresenceStore, userId) ?? "offline";
    } catch {
        return "offline";
    }
}

// Activity type -> human verb. type 4 (custom status) is excluded by callers.
const ACTIVITY_VERBS: Record<number, string> = {
    0: "Playing",
    1: "Streaming",
    2: "Listening to",
    3: "Watching",
    5: "Competing in"
};

const STATUS_LABELS: Record<string, string> = {
    online: "Online",
    idle: "Idle",
    dnd: "Do Not Disturb",
    offline: "Offline / Invisible"
};

interface Activity {
    name?: string;
    type?: number;
    application_id?: string;
}

// Real activities the client actually has for this user. Empty for users who are
// genuinely invisible, since Discord never sends their presence to us.
function getActivities(userId: string): Activity[] {
    try {
        const activities: Activity[] = PresenceStore.getActivities?.(userId) ?? [];
        // Drop custom status (type 4) - that's the "set a custom status" text, not a game/RPC.
        return activities.filter(a => a && a.name && a.type !== 4);
    } catch {
        return [];
    }
}

const StatusDot = ({ color }: { color: string; }) => (
    <div
        className="vc-fake-status-dot"
        style={{ backgroundColor: color }}
    />
);

const DOT_COLORS: Record<string, string> = {
    online: "#23a55a",
    idle: "#f0b232",
    dnd: "#f23f43",
    offline: "#80848e"
};

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }) => {
    if (!user) return;

    const active = overrides[user.id];
    const realStatus = getRealStatus(user.id);
    const activities = getActivities(user.id);
    const hiddenWhileActive = realStatus === "offline" && activities.length > 0;

    children.push(
        <Menu.MenuItem
            id="vc-fake-status"
            label="Fake Status"
        >
            <Menu.MenuGroup label="Info">
                <Menu.MenuItem
                    id="vc-fake-status-real"
                    label={`Actual status: ${STATUS_LABELS[realStatus] ?? realStatus}`}
                    icon={() => <StatusDot color={DOT_COLORS[realStatus] ?? DOT_COLORS.offline} />}
                    disabled
                />

                {activities.map((a, i) => (
                    <Menu.MenuItem
                        key={i}
                        id={`vc-fake-status-activity-${i}`}
                        label={`${ACTIVITY_VERBS[a.type ?? 0] ?? "Playing"} ${a.name}${a.application_id ? " (RPC)" : ""}`}
                        disabled
                    />
                ))}

                {hiddenWhileActive && (
                    <Menu.MenuItem
                        id="vc-fake-status-leak"
                        label="⚠ Appears invisible but is active"
                        color="danger"
                        disabled
                    />
                )}
            </Menu.MenuGroup>

            <Menu.MenuSeparator />

            {STATUS_OPTIONS.map(option => (
                <Menu.MenuItem
                    key={option.key}
                    id={`vc-fake-status-${option.key}`}
                    label={active === option.key ? `✓ ${option.label}` : option.label}
                    icon={() => <StatusDot color={DOT_COLORS[option.key]} />}
                    action={() => setOverride(user.id, option.key)}
                />
            ))}

            <Menu.MenuSeparator />

            <Menu.MenuItem
                id="vc-fake-status-reset"
                label="Reset"
                color="danger"
                disabled={!active}
                action={() => clearOverride(user.id)}
            />
        </Menu.MenuItem>
    );
};

export default definePlugin({
    name: "FakeStatus",
    description: "Locally override any user's status (online, idle, dnd, invisible). Client-side only - nobody else sees the change.",
    authors: [{ name: "Supercord", id: 0n }],

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    async start() {
        overrides = (await DataStore.get<Record<string, string>>(STORE_KEY)) ?? {};

        if (typeof PresenceStore?.getStatus !== "function") {
            logger.error("Could not find PresenceStore.getStatus - aborting patch.");
            return;
        }

        originalGetStatus = PresenceStore.getStatus;
        PresenceStore.getStatus = patchedGetStatus;
        refresh();
    },

    stop() {
        if (originalGetStatus) {
            PresenceStore.getStatus = originalGetStatus;
            originalGetStatus = null;
        }
        refresh();
    }
});
