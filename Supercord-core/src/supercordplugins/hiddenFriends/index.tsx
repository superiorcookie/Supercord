/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId,NavContextMenuPatchCallback } from "@api/ContextMenu";
import { HeaderBarButton } from "@api/HeaderBar";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { useForceUpdater } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, ContextMenuApi, Menu, NavigationRouter, React, ReactDOM, SelectedChannelStore,UserStore } from "@webpack/common";

let forceUpdateDms: (() => void) | undefined = undefined;

function HiddenFriendsMenu({ onClose }: { onClose: () => void }) {
    const { hiddenIds } = settings.store;

    return (
        <Menu.Menu navId="hidden-friends" onClose={onClose} label="Hidden Friends">
            {hiddenIds.length === 0 ? (
                <Menu.MenuItem id="empty" label="No hidden friends" disabled />
            ) : (
                hiddenIds.map(id => {
                    const channel = ChannelStore.getChannel(id);
                    if (!channel) return null;

                    let { name } = channel;
                    if (!name && channel.type === 1) {
                        const user = UserStore.getUser(channel.recipients[0]);
                        name = user?.globalName || user?.username || "Unknown User";
                    }

                    return (
                        <Menu.MenuItem
                            key={id}
                            id={id}
                            label={name || "Unknown Group"}
                            action={() => {
                                NavigationRouter.transitionTo(`/channels/@me/${id}`);
                                onClose();
                            }}
                        />
                    );
                })
            )}
        </Menu.Menu>
    );
}

const settings = definePluginSettings({
    hiddenIds: {
        type: OptionType.CUSTOM,
        default: [] as string[],
        description: "List of hidden channel IDs"
    },
    showHidden: {
        type: OptionType.BOOLEAN,
        default: false,
        description: "Toggle to temporarily show hidden friends in the list"
    }
});

function toggleHideChannel(channelId: string) {
    if (settings.store.hiddenIds.includes(channelId)) {
        settings.store.hiddenIds = settings.store.hiddenIds.filter(id => id !== channelId);
    } else {
        settings.store.hiddenIds = [...settings.store.hiddenIds, channelId];
    }
    // Dispatch an event to force update the DM list
    forceUpdateDms?.();
}

function Icon(props: any) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" {...props}>
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
        </svg>
    );
}

function createHideMenuItem(channelId: string) {
    const isHidden = settings.store.hiddenIds.includes(channelId);

    return (
        <Menu.MenuItem
            id="vc-hide-friend"
            label={isHidden ? "Unhide Friend" : "Hide Friend"}
            color={isHidden ? "default" : "danger"}
            action={() => toggleHideChannel(channelId)}
        />
    );
}

const GroupDMContext: NavContextMenuPatchCallback = (children, props) => {
    const container = findGroupChildrenByChildId("leave-channel", children);
    container?.unshift(createHideMenuItem(props.channel.id));
};

const UserContext: NavContextMenuPatchCallback = (children, props) => {
    const container = findGroupChildrenByChildId("close-dm", children);
    if (container) {
        const idx = container.findIndex(c => c?.props?.id === "close-dm");
        container.splice(idx, 0, createHideMenuItem(props.channel.id));
    }
};

function injectSidebarButton() {
    const friendsLink = document.querySelector('a[href="/channels/@me"]');
    const ul = friendsLink ? friendsLink.closest("ul") : null;

    if (ul && !document.getElementById("vc-hidden-friends-btn")) {
        const li = document.createElement("li");
        li.id = "vc-hidden-friends-btn";
        li.className = "channel__972a0 container_e45859";
        ul.appendChild(li);

        // eslint-disable-next-line react/no-deprecated
        ReactDOM.render(
            <div className="interactive_f5eb4b interactive_c91bad" style={{ cursor: "pointer", padding: "1px 0" }} onClick={e => {
                ContextMenuApi.openContextMenu(e, () => <HiddenFriendsMenu onClose={ContextMenuApi.closeContextMenu} />);
            }}>
                <div className="layout_c91bad">
                    <div className="avatar_c91bad" style={{ margin: "0 12px", display: "flex", alignItems: "center" }}>
                        <Icon width={24} height={24} style={{ color: "var(--interactive-normal)" }} />
                    </div>
                    <div className="content_c91bad">
                        <div className="nameAndDecorators_c91bad">
                            <div className="name_c91bad" style={{ color: "var(--interactive-normal)", fontWeight: 500 }}>
                                Hidden
                            </div>
                        </div>
                    </div>
                </div>
            </div>,
            li
        );
    }
}

const UserProfileContext: NavContextMenuPatchCallback = (children, props: any) => {
    const { user } = props;
    if (!user) return;

    // We need the DM channel ID to hide/unhide
    const channelId = ChannelStore.getDMFromUserId(user.id);
    if (!channelId) return;

    const isHidden = settings.store.hiddenIds.includes(channelId);

    // Try to place it near "block" or "ignore", otherwise just append
    const container = findGroupChildrenByChildId("block", children) || findGroupChildrenByChildId("ignore", children) || children;

    if (Array.isArray(container)) {
        const blockIdx = container.findIndex(c => c?.props?.id === "block" || c?.props?.id === "ignore");
        if (blockIdx > -1) {
            container.splice(blockIdx, 0, createHideMenuItem(channelId));
        } else {
            container.push(createHideMenuItem(channelId));
        }
    }
};

function injectFriendsTab() {
    // Find the Friends tab bar by looking for the Add Friend button
    const tabBar = document.querySelector('[class*="tabBar_"][aria-label="Friends"]') || document.querySelector('[class*="tabBar_"][role="tablist"]');
    if (!tabBar) return;

    const tabs = Array.from(tabBar.children);
    const addFriendBtn = tabs.find(c => c.textContent === "Add Friend" || c.className.includes("addFriend"));
    if (!addFriendBtn) return;

    if (document.getElementById("vc-hidden-friends-top-tab")) return;

    const newTab = document.createElement("div");
    newTab.id = "vc-hidden-friends-top-tab";
    // Copy the class of a normal tab (e.g. the "All" tab) to blend in
    const normalTab = tabs.find(c => c.textContent === "All");
    newTab.className = normalTab ? normalTab.className.replace(/selected_[a-zA-Z0-9]+/, "") : "item_c2739c themed_a0";
    newTab.style.cursor = "pointer";
    newTab.innerText = "Hidden";
    newTab.setAttribute("role", "tab");

    // Insert before "Add Friend"
    tabBar.insertBefore(newTab, addFriendBtn);

    // Clicking the tab opens the same ContextMenu right under the tab
    newTab.addEventListener("click", e => {
        ContextMenuApi.openContextMenu(e as any, () => <HiddenFriendsMenu onClose={ContextMenuApi.closeContextMenu} />);
    });
}

let injectInterval: any;

export default definePlugin({
    name: "HiddenFriends",
    description: "Hide friends and groups from your DM list, and view them in a dedicated menu.",
    tags: ["Privacy", "Organisation"],
    authors: [Devs.prism],
    dependencies: ["HeaderBarAPI"],
    settings,

    start() {
        injectInterval = setInterval(() => {
            injectSidebarButton();
            injectFriendsTab();
        }, 1000);
    },

    stop() {
        clearInterval(injectInterval);
        const el = document.getElementById("vc-hidden-friends-btn");
        if (el) {
            // eslint-disable-next-line react/no-deprecated
            ReactDOM.unmountComponentAtNode(el);
            el.remove();
        }
        const topTab = document.getElementById("vc-hidden-friends-top-tab");
        if (topTab) topTab.remove();
    },

    contextMenus: {
        "gdm-context": GroupDMContext,
        "user-context": UserContext,
        "user-profile-actions": UserProfileContext
    },

    headerBarButton: {
        location: "channeltoolbar",
        render: function HideToggleButton(props: any) {
            // Re-render when settings change so the icon/tooltip updates
            settings.use(["hiddenIds"]);
            const channelId = SelectedChannelStore.getChannelId();
            const channel = ChannelStore.getChannel(channelId);

            if (!channel || (channel.type !== 1 && channel.type !== 3)) return null;

            const isHidden = settings.store.hiddenIds.includes(channel.id);

            return (
                <HeaderBarButton
                    tooltip={isHidden ? "Unhide Conversation" : "Hide Conversation"}
                    icon={Icon}
                    iconSize={24}
                    onClick={() => toggleHideChannel(channel.id)}
                    {...props}
                />
            );
        }
    },

    patches: [
        {
            find: '"dm-quick-launcher"===',
            replacement: {
                match: /(?<=channels:\i,privateChannelIds:.+?)(?=,listRef:)/,
                replace: "$&.filter(c=>$self.shouldShowChannel(c))"
            }
        },
        {
            find: ".FRIENDS},\"friends\"",
            replacement: {
                match: /let{showLibrary:\i,/,
                replace: "$self.useHiddenFriends();$&"
            }
        }
    ],

    useHiddenFriends() {
        forceUpdateDms = useForceUpdater();
        settings.use(["showHidden", "hiddenIds"]);
    },

    shouldShowChannel(channelId: string) {
        if (settings.store.showHidden) return true;
        return !settings.store.hiddenIds.includes(channelId);
    }
});
