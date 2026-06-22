/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import { EyeIcon, PencilIcon } from "@components/Icons";
import { Switch } from "@components/Switch";
import { EquicordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { copyWithToast, fetchUserProfile } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { Channel, RenderModalProps, User } from "@vencord/discord-types";
import { Button, ChannelStore, FluxDispatcher, IconUtils, Menu, Modal, openModal, React, RelationshipStore, TextArea, TextInput, Toasts, UserProfileStore, UserStore } from "@webpack/common";
import virtualMerge from "virtual-merge";

interface LocalUserOverride {
    userId: string;
    name?: string;
    username?: string;
    avatarUrl?: string;
    bio?: string;
    pronouns?: string;
    hideFriend?: boolean;
    hideFromLists?: boolean;
}

interface QuickSwitcherResult {
    channel_id?: string;
    channel?: Channel;
    record?: Partial<User> & Partial<Channel> & {
        channel_id?: string;
        recipients?: string[];
        rawRecipients?: User[];
    };
}

const DATA_KEY = "Equicord_LocalUserEditor_Users";
const cl = classNameFactory("vc-local-user-editor-");

// Marker used to make patchUser idempotent. Without this, message rendering re-wraps
// an already-patched author on every render, nesting virtualMerge proxies until it
// crashes the client.
const PATCHED_FLAG = "__vcLocalUserEditorPatched";

const data = {
    users: {} as Record<string, LocalUserOverride>
};

const settings = definePluginSettings({
    showContextMenuButton: {
        type: OptionType.BOOLEAN,
        description: "Show the local edit button in user right-click menus.",
        default: true
    },
    showSettingsManager: {
        type: OptionType.BOOLEAN,
        description: "Show the user-friendly editor in this settings page. Saved edits keep applying while this is off.",
        default: true
    },
    quietMode: {
        type: OptionType.BOOLEAN,
        description: "Hide extra management UI while keeping all saved local edits active.",
        default: false
    },
    userManager: {
        type: OptionType.COMPONENT,
        description: "Manage locally edited users.",
        component: () => settings.store.showSettingsManager && !settings.store.quietMode ? <LocalUserSettings /> : null
    }
});

let originalGetUser: any = null;
let originalGetUsers: any = null;
let originalGetUserProfile: any = null;
let originalGetGuildMemberProfile: any = null;
let originalGetFriendIDs: any = null;
let originalIsFriend: any = null;
let originalGetRelationshipType: any = null;
let originalGetNickname: any = null;

function normalizeId(id: string) {
    return id.trim();
}

function getOverride(userId?: string | null) {
    return userId ? data.users[userId] : undefined;
}

function hasVisibleEdit(entry?: LocalUserOverride) {
    return Boolean(entry?.name || entry?.username || entry?.avatarUrl || entry?.bio || entry?.pronouns);
}

function shouldHideFriend(userId?: string | null) {
    return Boolean(getOverride(userId)?.hideFriend);
}

function shouldHideFromLists(userId?: string | null) {
    const entry = getOverride(userId);
    return Boolean(entry?.hideFriend || entry?.hideFromLists);
}

function emitUserChanges() {
    UserStore.emitChange?.();
    RelationshipStore.emitChange?.();
    UserProfileStore.emitChange?.();
    ChannelStore.emitChange?.();
    FluxDispatcher.dispatch({ type: "LOCAL_USER_EDITOR_UPDATE" });
}

async function saveData() {
    await DataStore.set(DATA_KEY, data.users);
    emitUserChanges();
}

function patchUser<T extends Partial<User> | null | undefined>(user: T): T {
    if (!user?.id) return user;
    // Already patched - return as-is so repeated renders don't nest proxies and crash.
    if ((user as any)[PATCHED_FLAG]) return user;

    const entry = getOverride(user.id);
    if (!entry || !hasVisibleEdit(entry)) return user;

    const displayName = entry.name?.trim();
    const username = entry.username?.trim();

    return virtualMerge(user, {
        [PATCHED_FLAG]: true,
        ...(displayName ? {
            globalName: displayName,
            global_name: displayName,
            displayName,
            nick: displayName
        } : {}),
        ...(username ? {
            username,
            usernameNormalized: username.toLowerCase()
        } : {})
    }) as T;
}

function patchProfile<T extends Record<string, any> | null | undefined>(profile: T, userId?: string): T {
    const entry = getOverride(userId ?? profile?.userId ?? profile?.user?.id);
    if (!entry) return profile;

    return virtualMerge(profile ?? {}, {
        ...(entry.bio != null ? { bio: entry.bio } : {}),
        ...(entry.pronouns != null ? { pronouns: entry.pronouns } : {})
    }) as T;
}

function getChannelHiddenUserIds(channel?: Channel | null) {
    const ids = new Set<string>();
    const anyChannel = channel as any;

    anyChannel?.recipients?.forEach((id: string) => ids.add(id));
    anyChannel?.rawRecipients?.forEach((user: User) => user?.id && ids.add(user.id));

    const recipientId = anyChannel?.getRecipientId?.();
    if (recipientId) ids.add(recipientId);

    return ids;
}

function resultHasHiddenUser(result?: QuickSwitcherResult) {
    if (!result) return false;

    const record = result.record;
    if (shouldHideFromLists((record as User | undefined)?.id)) return true;
    if (shouldHideFromLists(result.channel_id ?? record?.channel_id)) return true;

    const channel = result.channel ?? (record as Channel | undefined);
    for (const userId of getChannelHiddenUserIds(channel)) {
        if (shouldHideFromLists(userId)) return true;
    }

    return false;
}

function getDisplayName(userId: string) {
    const user = UserStore.getUser(userId) as User | undefined;
    return getOverride(userId)?.name || user?.globalName || user?.username || userId;
}

function getAvatarUrl(userId: string, size = 80) {
    const entry = getOverride(userId);
    if (entry?.avatarUrl) return entry.avatarUrl;

    const user = UserStore.getUser(userId);
    return user ? IconUtils.getUserAvatarURL(user, true, size) : IconUtils.getDefaultAvatarURL(userId);
}

function getOriginalUser(userId: string): User | undefined {
    return (originalGetUser?.call(UserStore, userId) ?? UserStore.getUser(userId)) as User | undefined;
}

function getOriginalAvatarUrl(userId: string, size = 80) {
    const user = getOriginalUser(userId);
    return user ? IconUtils.getUserAvatarURL(user, true, size) : IconUtils.getDefaultAvatarURL(userId);
}

function getOriginalProfile(userId: string): any {
    return originalGetUserProfile?.call(UserProfileStore, userId) ?? UserProfileStore.getUserProfile(userId);
}

function getProfileLink(userId: string) {
    return userId ? `https://discord.com/users/${userId}` : "";
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange(value: boolean): void; }) {
    return (
        <label className={cl("toggle-row")}>
            <Switch checked={value} onChange={onChange} />
            <span>{label}</span>
        </label>
    );
}

function LocalUserEditorModal({ modalProps, initialUserId }: { modalProps: RenderModalProps; initialUserId?: string; }) {
    const existing = initialUserId ? getOverride(initialUserId) : undefined;
    const user = initialUserId ? getOriginalUser(initialUserId) : undefined;
    const [originalProfile, setOriginalProfile] = React.useState<any>(() => initialUserId ? getOriginalProfile(initialUserId) : null);
    const [loadingProfile, setLoadingProfile] = React.useState(false);

    const [userId, setUserId] = React.useState(initialUserId ?? "");
    const [name, setName] = React.useState(existing?.name ?? user?.globalName ?? "");
    const [username, setUsername] = React.useState(existing?.username ?? user?.username ?? "");
    const [avatarUrl, setAvatarUrl] = React.useState(existing?.avatarUrl ?? (initialUserId ? getOriginalAvatarUrl(initialUserId) : ""));
    const [bio, setBio] = React.useState(existing?.bio ?? originalProfile?.bio ?? "");
    const [pronouns, setPronouns] = React.useState(existing?.pronouns ?? originalProfile?.pronouns ?? "");
    const [hideFriend, setHideFriend] = React.useState(Boolean(existing?.hideFriend));
    const [hideFromLists, setHideFromLists] = React.useState(Boolean(existing?.hideFromLists));
    const hydratedProfileFields = React.useRef(Boolean(existing || originalProfile?.bio || originalProfile?.pronouns));

    const effectiveUserId = normalizeId(userId);
    const profileLink = getProfileLink(effectiveUserId);
    const originalDisplayName = user?.globalName || "";
    const originalUsername = user?.username || "";
    const originalAvatarUrl = initialUserId ? getOriginalAvatarUrl(initialUserId) : "";
    const originalBio = originalProfile?.bio ?? "";
    const originalPronouns = originalProfile?.pronouns ?? "";

    React.useEffect(() => {
        if (!initialUserId) return;

        let cancelled = false;
        setLoadingProfile(true);
        fetchUserProfile(initialUserId, undefined, false)
            .then(() => {
                if (!cancelled) setOriginalProfile(getOriginalProfile(initialUserId));
            })
            .catch(() => null)
            .finally(() => {
                if (!cancelled) setLoadingProfile(false);
            });

        return () => {
            cancelled = true;
        };
    }, [initialUserId]);

    React.useEffect(() => {
        if (existing) return;
        if (hydratedProfileFields.current) return;
        if (!originalBio && !originalPronouns) return;

        setBio(originalBio);
        setPronouns(originalPronouns);
        hydratedProfileFields.current = true;
    }, [existing, originalBio, originalPronouns]);

    async function save() {
        const id = normalizeId(userId);
        if (!id) {
            Toasts.show({ message: "Enter a user ID first.", type: Toasts.Type.FAILURE, id: Toasts.genId() });
            return;
        }

        const next: LocalUserOverride = {
            userId: id,
            name: name.trim() && name.trim() !== originalDisplayName ? name.trim() : undefined,
            username: username.trim() && username.trim() !== originalUsername ? username.trim() : undefined,
            avatarUrl: avatarUrl.trim() && avatarUrl.trim() !== originalAvatarUrl ? avatarUrl.trim() : undefined,
            bio: bio !== originalBio ? bio : undefined,
            pronouns: pronouns.trim() !== originalPronouns ? pronouns.trim() : undefined,
            hideFriend,
            hideFromLists
        };

        if (!next.name && !next.username && !next.avatarUrl && next.bio == null && next.pronouns == null && !next.hideFriend && !next.hideFromLists) {
            delete data.users[id];
        } else {
            data.users[id] = next;
        }

        await saveData();
        modalProps.onClose();
    }

    async function remove() {
        const id = normalizeId(userId);
        if (id) {
            delete data.users[id];
            await saveData();
        }
        modalProps.onClose();
    }

    const actions = [
        {
            text: "Save",
            variant: "primary",
            onClick: save
        },
        {
            text: "Cancel",
            variant: "secondary",
            onClick: modalProps.onClose
        }
    ];

    if (existing) {
        actions.unshift({
            text: "Delete",
            variant: "dangerPrimary",
            onClick: remove
        });
    }

    return (
        <Modal {...modalProps} size="md" title={initialUserId ? `Local Edit: ${getDisplayName(initialUserId)}` : "Add Local User Edit"} actions={actions}>
            <div className={cl("modal")}>
                <div className={cl("preview")}>
                    <img src={avatarUrl.trim() || (initialUserId ? getAvatarUrl(initialUserId) : "")} alt="" />
                    <div>
                        <BaseText size="lg">{name.trim() || user?.globalName || user?.username || "User preview"}</BaseText>
                        <BaseText size="sm" color="text-muted">{username.trim() || user?.username || userId || "User ID"}</BaseText>
                    </div>
                </div>

                <Field label="User ID">
                    <TextInput disabled={Boolean(initialUserId)} value={userId} onChange={setUserId} placeholder="123456789012345678" />
                </Field>
                <ReadOnlyField
                    label="Profile link"
                    value={profileLink || "Enter a user ID to create a profile link"}
                    actions={profileLink ? (
                        <>
                            <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={() => copyWithToast(profileLink, "Profile link copied!")}>
                                Copy
                            </Button>
                            <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={() => VencordNative.native.openExternal(profileLink)}>
                                Open
                            </Button>
                        </>
                    ) : null}
                />
                <Field label="Display name" original={originalDisplayName || "None"} onUseOriginal={() => setName(originalDisplayName)} onClear={() => setName("")}>
                    <TextInput value={name} onChange={setName} placeholder={user?.globalName || user?.username || "Local display name"} />
                </Field>
                <Field label="Username" original={originalUsername || "None"} onUseOriginal={() => setUsername(originalUsername)} onClear={() => setUsername("")}>
                    <TextInput value={username} onChange={setUsername} placeholder={user?.username || "Local username"} />
                </Field>
                <Field label="Avatar URL" original={originalAvatarUrl || "None"} onUseOriginal={() => setAvatarUrl(originalAvatarUrl)} onClear={() => setAvatarUrl("")}>
                    <TextInput value={avatarUrl} onChange={setAvatarUrl} placeholder="https://example.com/avatar.png" />
                </Field>
                <Field label="Pronouns" original={loadingProfile ? "Loading..." : originalPronouns || "None"} onUseOriginal={() => setPronouns(originalPronouns)} onClear={() => setPronouns("")}>
                    <TextInput value={pronouns} onChange={setPronouns} placeholder="they/them" />
                </Field>
                <Field label="Bio" original={loadingProfile ? "Loading..." : originalBio || "None"} onUseOriginal={() => setBio(originalBio)} onClear={() => setBio("")}>
                    <TextArea value={bio} onChange={setBio} rows={4} placeholder="Local profile bio" />
                </Field>

                <ToggleRow label="Hide this user from friends/search/DM lists" value={hideFromLists} onChange={setHideFromLists} />
                <ToggleRow label="Make this user look like they are not your friend" value={hideFriend} onChange={setHideFriend} />
            </div>
        </Modal>
    );
}

function Field({ label, original, onUseOriginal, onClear, children }: { label: string; original?: string; onUseOriginal?(): void; onClear?(): void; children: React.ReactNode; }) {
    return (
        <label className={cl("field")}>
            <div className={cl("field-header")}>
                <BaseText size="sm" color="text-muted">{label}</BaseText>
                {(onUseOriginal || onClear) && (
                    <div className={cl("field-actions")}>
                        {onUseOriginal && <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={event => { event.preventDefault(); onUseOriginal(); }}>Use Original</Button>}
                        {onClear && <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={event => { event.preventDefault(); onClear(); }}>Clear</Button>}
                    </div>
                )}
            </div>
            {original != null && <div className={cl("original-value")}>Original: {original}</div>}
            {children}
        </label>
    );
}

function ReadOnlyField({ label, value, actions }: { label: string; value: string; actions?: React.ReactNode; }) {
    return (
        <div className={cl("field")}>
            <div className={cl("field-header")}>
                <BaseText size="sm" color="text-muted">{label}</BaseText>
                {actions && <div className={cl("field-actions")}>{actions}</div>}
            </div>
            <div className={cl("readonly-value")}>{value}</div>
        </div>
    );
}

function openEditor(userId?: string) {
    openModal(modalProps => <LocalUserEditorModal modalProps={modalProps} initialUserId={userId} />);
}

function LocalUserSettings() {
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);
    const entries = Object.values(data.users).sort((a, b) => getDisplayName(a.userId).localeCompare(getDisplayName(b.userId)));

    React.useEffect(() => {
        const unsubscribe = () => forceUpdate();
        FluxDispatcher.subscribe("LOCAL_USER_EDITOR_UPDATE", unsubscribe);
        return () => FluxDispatcher.unsubscribe("LOCAL_USER_EDITOR_UPDATE", unsubscribe);
    }, []);

    return (
        <div className={cl("settings")}>
            <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={() => openEditor()}>
                Add User Edit
            </Button>

            {!entries.length && <BaseText color="text-muted">No local user edits saved yet.</BaseText>}

            {entries.map(entry => (
                <div className={cl("card")} key={entry.userId}>
                    <img src={getAvatarUrl(entry.userId, 64)} alt="" />
                    <div className={cl("card-main")}>
                        <BaseText size="md">{getDisplayName(entry.userId)}</BaseText>
                        <BaseText size="sm" color="text-muted">{entry.userId}</BaseText>
                        <div className={cl("badges")}>
                            {entry.hideFriend && <span><EyeIcon width={12} height={12} /> Not friend</span>}
                            {entry.hideFromLists && <span><EyeIcon width={12} height={12} /> Hidden lists</span>}
                        </div>
                    </div>
                    <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} onClick={() => openEditor(entry.userId)}>
                        Edit
                    </Button>
                </div>
            ))}
        </div>
    );
}

const userContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user?.id || settings.store.quietMode || !settings.store.showContextMenuButton) return;

    const group = findGroupChildrenByChildId("user-profile", children);
    const item = (
        <Menu.MenuItem
            id="vc-local-user-editor"
            label={getOverride(user.id) ? "Edit Local User" : "Create Local User Edit"}
            icon={PencilIcon}
            action={() => openEditor(user.id)}
        />
    );

    if (group) group.push(item);
    else children.push(<Menu.MenuSeparator />, item);
};

export default definePlugin({
    name: "LocalUserEditor",
    description: "Locally change user names, avatars, bios, pronouns, and hide friends/lists without changing anything server-side.",
    tags: ["Appearance", "Friends", "Utility"],
    authors: [EquicordDevs.yash],
    settings,
    contextMenus: {
        "user-context": userContextPatch
    },
    patches: [
        {
            find: "getUserAvatarURL:",
            replacement: [
                {
                    match: /(getUserAvatarURL:)(\i),/,
                    replace: "$1$self.getAvatarHook($2),"
                },
                {
                    match: /(getGuildMemberAvatarURLSimple:)(\i),/,
                    replace: "$1$self.getGuildMemberAvatarHook($2),"
                }
            ]
        },
        {
            find: ".NITRO_NOTIFICATION,[",
            replacement: {
                match: /renderContentOnly:\i}=\i;/,
                replace: "$&try{if(arguments[0]?.message?.author)arguments[0].message.author=$self.patchUser(arguments[0].message.author);}catch{}"
            }
        },
        {
            find: '"dm-quick-launcher"===',
            replacement: [
                {
                    match: /render\(\)\{/,
                    replace: "$&this.props.privateChannelIds=$self.filterPrivateChannelIds(this.props.privateChannelIds);"
                },
                {
                    match: /renderRow=\i=>\{/,
                    replace: "$&this.props.privateChannelIds=$self.filterPrivateChannelIds(this.props.privateChannelIds);"
                },
                {
                    match: /renderDM=\(\i,\i\)=>\{/,
                    replace: "$&this.props.privateChannelIds=$self.filterPrivateChannelIds(this.props.privateChannelIds);"
                }
            ]
        },
        {
            find: "#{intl::QUICKSWITCHER_PROTIP}",
            replacement: {
                match: /(?<=renderResults\(\){.{0,100})let{query/,
                replace: "this.props.results = $self.filterQuickSwitcherResults(this.props.results);$&"
            }
        }
    ],
    data,
    async start() {
        data.users = await DataStore.get<Record<string, LocalUserOverride>>(DATA_KEY) ?? {};

        const userStore = UserStore as any;
        const profileStore = UserProfileStore as any;
        const relationshipStore = RelationshipStore as any;

        originalGetUser = userStore.getUser;
        originalGetUsers = userStore.getUsers;
        originalGetUserProfile = profileStore.getUserProfile;
        originalGetGuildMemberProfile = profileStore.getGuildMemberProfile;
        originalGetFriendIDs = relationshipStore.getFriendIDs;
        originalIsFriend = relationshipStore.isFriend;
        originalGetRelationshipType = relationshipStore.getRelationshipType;
        originalGetNickname = relationshipStore.getNickname;

        userStore.getUser = function (...args: any[]) {
            return patchUser(originalGetUser!.apply(this, args));
        };

        userStore.getUsers = function (...args: any[]) {
            const users = originalGetUsers!.apply(this, args);
            if (!users) return users;

            return Object.fromEntries(
                Object.entries(users).map(([id, user]) => [id, patchUser(user as User)])
            );
        };

        profileStore.getUserProfile = function (...args: any[]) {
            return patchProfile(originalGetUserProfile!.apply(this, args), args[0]);
        };

        profileStore.getGuildMemberProfile = function (...args: any[]) {
            return patchProfile(originalGetGuildMemberProfile!.apply(this, args), args[0]);
        };

        relationshipStore.getFriendIDs = function (...args: any[]) {
            return originalGetFriendIDs!.apply(this, args).filter((id: string) => !shouldHideFriend(id));
        };

        relationshipStore.isFriend = function (...args: any[]) {
            return shouldHideFriend(args[0]) ? false : originalIsFriend!.apply(this, args);
        };

        relationshipStore.getRelationshipType = function (...args: any[]) {
            return shouldHideFriend(args[0]) ? 0 : originalGetRelationshipType!.apply(this, args);
        };

        relationshipStore.getNickname = function (...args: any[]) {
            const entry = getOverride(args[0]);
            return entry?.name || originalGetNickname!.apply(this, args);
        };

        emitUserChanges();
    },
    stop() {
        const userStore = UserStore as any;
        const profileStore = UserProfileStore as any;
        const relationshipStore = RelationshipStore as any;

        if (originalGetUser) userStore.getUser = originalGetUser;
        if (originalGetUsers) userStore.getUsers = originalGetUsers;
        if (originalGetUserProfile) profileStore.getUserProfile = originalGetUserProfile;
        if (originalGetGuildMemberProfile) profileStore.getGuildMemberProfile = originalGetGuildMemberProfile;
        if (originalGetFriendIDs) relationshipStore.getFriendIDs = originalGetFriendIDs;
        if (originalIsFriend) relationshipStore.isFriend = originalIsFriend;
        if (originalGetRelationshipType) relationshipStore.getRelationshipType = originalGetRelationshipType;
        if (originalGetNickname) relationshipStore.getNickname = originalGetNickname;

        emitUserChanges();
    },
    patchUser,
    getAvatarHook: (original: typeof IconUtils.getUserAvatarURL) => (user: User, animated: boolean, size: number) => {
        const avatarUrl = getOverride(user?.id)?.avatarUrl;
        if (!avatarUrl) return original(user, animated, size);

        try {
            const url = new URL(avatarUrl);
            url.searchParams.set("animated", animated ? "true" : "false");
            if (size) url.searchParams.set("size", String(size));
            return url.toString();
        } catch {
            return avatarUrl;
        }
    },
    getGuildMemberAvatarHook: (original: typeof IconUtils.getGuildMemberAvatarURLSimple) => (config: any) => {
        const avatarUrl = getOverride(config?.userId)?.avatarUrl;
        if (!avatarUrl) return original(config);

        try {
            const url = new URL(avatarUrl);
            if (config?.size) url.searchParams.set("size", String(config.size));
            return url.toString();
        } catch {
            return avatarUrl;
        }
    },
    filterPrivateChannelIds(privateChannelIds: string[]) {
        return privateChannelIds.filter(id => {
            const channel = ChannelStore.getChannel(id);
            for (const userId of getChannelHiddenUserIds(channel)) {
                if (shouldHideFromLists(userId)) return false;
            }
            return true;
        });
    },
    filterQuickSwitcherResults(results: QuickSwitcherResult[]) {
        return results.filter(result => !resultHasHiddenUser(result));
    }
});
