/*
 * Set01Everything — a Vencord plugin
 * Turns every avatar, server icon, banner, emoji and sticker in Discord into the
 * Fortnite "Set_01_OA" (Geoff Keighley) outfit, and rewrites names + profile bios
 * to "Set_01_OA". Purely for fun.
 *
 * The effect is OFF by default. A toggle button (using the Set_01_OA icon) is
 * added to the channel header toolbar, right next to the inbox button. Click it
 * to flip everything on/off live — no reload needed. Everything is reversible.
 *
 * ── INSTALL (requires a from-source Vencord/Equicord dev install) ────────────
 *  1. Have Vencord cloned and set up (https://docs.vencord.dev/installing/custom-plugins/).
 *  2. Copy this folder (Set01Everything) into:  <Vencord>/src/userplugins/
 *  3. From the Vencord folder run:  pnpm build  &&  pnpm inject
 *  4. Restart Discord, then enable "Set01Everything" in Settings → Plugins.
 *  (This canNOT be loaded as a standalone file the way a .theme.css can.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps } from "@webpack";

const GEOFF_IMAGE =
    "https://static.wikia.nocookie.net/fortnite/images/6/6d/Geoff_Keighley_-_Outfit_-_Fortnite.png/revision/latest?cb=20240520202727";
const SET_NAME = "Set_01_OA";          // internal cosmetic id / default text
const BUTTON_ID = "set01-toggle";

const settings = definePluginSettings({
    imageUrl: {
        type: OptionType.STRING,
        description: "Image URL that everything visual gets replaced with (also used as the toggle icon).",
        default: GEOFF_IMAGE,
    },
    displayName: {
        type: OptionType.STRING,
        description: "Name to rename everyone to.",
        default: SET_NAME,
    },
    bioText: {
        type: OptionType.STRING,
        description: "Text to overwrite every profile bio / About Me with.",
        default: SET_NAME,
    },
    replaceAvatars: { type: OptionType.BOOLEAN, description: "Replace all user & group-DM avatars.", default: true },
    replaceServerIcons: { type: OptionType.BOOLEAN, description: "Replace all server / channel / app icons.", default: true },
    replaceBanners: { type: OptionType.BOOLEAN, description: "Replace all user & server banners.", default: true },
    replaceEmojis: { type: OptionType.BOOLEAN, description: "Replace all custom emojis & reactions.", default: true },
    replaceStickers: { type: OptionType.BOOLEAN, description: "Replace all stickers.", default: true },
    replaceNames: { type: OptionType.BOOLEAN, description: "Rename everyone (usernames, nicknames, display names).", default: true },
    replaceBios: { type: OptionType.BOOLEAN, description: "Overwrite every profile bio / About Me.", default: true },
    replaceAllText: { type: OptionType.BOOLEAN, description: "NUCLEAR: replace EVERY piece of visible text in the app (messages, buttons, labels...). Skips text boxes so you can still type.", default: true },
    cssFallback: { type: OptionType.BOOLEAN, description: "Inject CSS so background-image avatars, role icons & reactions also get replaced.", default: true },
});

// ── Runtime state ────────────────────────────────────────────────────────────
let active = false;                       // master switch — OFF by default
const restorers: Array<() => void> = [];  // undo callbacks for every applied patch

// Discord internal modules.
let IconUtils: Record<string, any> | undefined;
let EmojiUtils: Record<string, any> | undefined;
let StickerUtils: Record<string, any> | undefined;
let NameUtils: Record<string, any> | undefined;
let ProfileStore: Record<string, any> | undefined;

const AVATAR_FNS = ["getUserAvatarURL", "getGroupDMAvatarURL"];
const ICON_FNS = ["getGuildIconURL", "getChannelIconURL", "getApplicationIconURL"];
const BANNER_FNS = ["getGuildBannerURL", "getUserBannerURL"];

const url = () => settings.store.imageUrl || GEOFF_IMAGE;
const name = () => settings.store.displayName || SET_NAME;
const bio = () => settings.store.bioText || SET_NAME;

function safeFind(...props: string[]): Record<string, any> | undefined {
    try { return findByProps(...props); } catch { return undefined; }
}

function patchToImage(obj: Record<string, any> | undefined, fn: string) {
    if (!obj || typeof obj[fn] !== "function") return;
    const original = obj[fn];
    obj[fn] = () => url();
    restorers.push(() => (obj[fn] = original));
}

// ── CSS fallback ───────────────────────────────────────────────────────────--
let styleEl: HTMLStyleElement | undefined;
function injectCss() {
    const u = url();
    styleEl = document.createElement("style");
    styleEl.id = "set01-everything-css";
    styleEl.textContent = `
img[class*="emoji"], [class*="emojiContainer"] img, [class*="reaction"] img, [class*="emojiItem"] img {
    content: url("${u}") !important; object-fit: contain !important;
}
img[class*="sticker"], [class*="sticker"] img, [class*="stickerInspectBody"] img, [class*="stickerNode"] img {
    content: url("${u}") !important; object-fit: contain !important;
}
[class*="roleIcon"] img, img[class*="roleIcon"] { content: url("${u}") !important; }

/* Avatars — instant swap via content (covers the <img> inside the SVG mask) */
img[class*="avatar"],
img[src*="/avatars/"],
img[src*="/users/"][src*="/avatars/"],
foreignObject img[class*="avatar"] {
    content: url("${u}") !important; object-fit: cover !important; object-position: center top !important;
}

/* Server / channel / app icons */
img[src*="/icons/"],
img[src*="/app-icons/"],
[class*="guildIcon"] img,
[class*="circleIconButton"] img {
    content: url("${u}") !important; object-fit: cover !important;
}

/* Banners */
img[class*="banner"], [class*="banner"] img, img[src*="/banners/"] {
    content: url("${u}") !important; object-fit: cover !important;
}

[class*="avatarStack"] [style*="background-image"],
[class*="roleIcon"][style*="background-image"],
[class*="banner"][style*="background-image"],
[class*="bannerImage"][style*="background-image"] {
    background-image: url("${u}") !important; background-size: cover !important; background-position: center !important;
}
`;
    document.head.appendChild(styleEl);
    restorers.push(() => { styleEl?.remove(); styleEl = undefined; });
}

function patchNames() {
    if (!NameUtils || typeof NameUtils.getName !== "function") return;
    const orig = NameUtils.getName;
    NameUtils.getName = (...a: any[]) => {
        const r = orig.apply(NameUtils, a);
        return typeof r === "string" && r.length ? name() : r;
    };
    restorers.push(() => (NameUtils!.getName = orig));

    if (typeof NameUtils.getNickname === "function") {
        const origNick = NameUtils.getNickname;
        NameUtils.getNickname = (...a: any[]) => {
            const r = origNick.apply(NameUtils, a);
            return typeof r === "string" && r.length ? name() : r;
        };
        restorers.push(() => (NameUtils!.getNickname = origNick));
    }
}

function patchBios() {
    if (!ProfileStore || typeof ProfileStore.getUserProfile !== "function") return;
    const orig = ProfileStore.getUserProfile;
    ProfileStore.getUserProfile = (...a: any[]) => {
        const p = orig.apply(ProfileStore, a);
        return p && typeof p === "object" ? { ...p, bio: bio(), pronouns: name() } : p;
    };
    restorers.push(() => (ProfileStore!.getUserProfile = orig));
}

// ── Nuclear: replace EVERY visible text node ──────────────────────────────────
const textOriginals = new Map<Text, string>();
let textObserver: MutationObserver | undefined;

function shouldSkipText(node: Text): boolean {
    const data = node.data;
    if (!data || !data.trim()) return true;          // whitespace only
    if (data === name()) return true;                 // already replaced
    let el: HTMLElement | null = node.parentElement;
    while (el) {
        const tag = el.tagName;
        // Don't touch editable areas (so typing still works), code, or our button.
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT") return true;
        if (el.isContentEditable) return true;
        if (el.id === BUTTON_ID) return true;
        el = el.parentElement;
    }
    return false;
}

function replaceTextNode(node: Text) {
    if (shouldSkipText(node)) return;
    if (!textOriginals.has(node)) textOriginals.set(node, node.data);
    node.data = name();
}

function replaceTextUnder(root: Node) {
    if (root.nodeType === Node.TEXT_NODE) { replaceTextNode(root as Text); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) found.push(n as Text);
    found.forEach(replaceTextNode);
}

function startTextReplacer() {
    replaceTextUnder(document.body);

    const queue: Node[] = [];
    let scheduled = false;
    textObserver = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === "characterData") queue.push(m.target);
            else m.addedNodes.forEach(node => queue.push(node));
        }
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            const batch = queue.splice(0);
            for (const node of batch) replaceTextUnder(node);
        });
    });
    textObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    restorers.push(() => {
        textObserver?.disconnect();
        textObserver = undefined;
        textOriginals.forEach((orig, node) => {
            try { if (node.isConnected) node.data = orig; } catch { /* gone */ }
        });
        textOriginals.clear();
    });
}

// ── Apply / revert the whole effect ───────────────────────────────────────────
function applyEffects() {
    IconUtils = safeFind("getUserAvatarURL", "getGuildIconURL");
    if (IconUtils) {
        if (settings.store.replaceAvatars) AVATAR_FNS.forEach(fn => patchToImage(IconUtils, fn));
        if (settings.store.replaceServerIcons) ICON_FNS.forEach(fn => patchToImage(IconUtils, fn));
        if (settings.store.replaceBanners) BANNER_FNS.forEach(fn => patchToImage(IconUtils, fn));
        if (settings.store.replaceEmojis && typeof IconUtils.getEmojiURL === "function") patchToImage(IconUtils, "getEmojiURL");
    }
    if (settings.store.replaceEmojis) {
        EmojiUtils = safeFind("getEmojiURL");
        if (EmojiUtils && EmojiUtils !== IconUtils) patchToImage(EmojiUtils, "getEmojiURL");
    }
    if (settings.store.replaceStickers) {
        StickerUtils = safeFind("getStickerAssetURL") ?? safeFind("getStickerURL");
        if (StickerUtils) ["getStickerAssetURL", "getStickerURL"].forEach(fn => patchToImage(StickerUtils, fn));
    }
    if (settings.store.replaceNames) {
        NameUtils = safeFind("getName", "getNickname") ?? safeFind("getName");
        patchNames();
    }
    if (settings.store.replaceBios) {
        ProfileStore = safeFind("getUserProfile");
        patchBios();
    }
    if (settings.store.replaceAllText) startTextReplacer();
    if (settings.store.cssFallback) injectCss();
}

function revertEffects() {
    while (restorers.length) restorers.pop()!();
    IconUtils = EmojiUtils = StickerUtils = NameUtils = ProfileStore = undefined;
}

function setActive(next: boolean) {
    if (next === active) return;
    active = next;
    if (active) applyEffects();
    else revertEffects();
    updateButtons();
}

// ── Toolbar toggle button (DOM-injected next to the inbox button) ──────────────
let observer: MutationObserver | undefined;

function styleButton(btn: HTMLElement) {
    Object.assign(btn.style, {
        width: "24px",
        height: "24px",
        margin: "0 8px",
        borderRadius: "50%",
        cursor: "pointer",
        backgroundImage: `url("${url()}")`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        flex: "0 0 auto",
        alignSelf: "center",
        transition: "opacity .15s, box-shadow .15s, filter .15s",
    } as CSSStyleDeclaration);
}

function updateButtons() {
    document.querySelectorAll<HTMLElement>("#" + BUTTON_ID).forEach(btn => {
        btn.style.opacity = active ? "1" : "0.55";
        btn.style.filter = active ? "none" : "grayscale(0.6)";
        btn.style.boxShadow = active ? "0 0 8px 1px #ffd800" : "none";
        btn.title = `Set 01 Everything: ${active ? "ON" : "OFF"}`;
    });
}

function makeButton(): HTMLElement {
    const btn = document.createElement("div");
    btn.id = BUTTON_ID;
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "Toggle Set 01 Everything");
    styleButton(btn);
    btn.addEventListener("click", () => setActive(!active));
    return btn;
}

function ensureButton() {
    // Already present in the live DOM? Nothing to do.
    if (document.getElementById(BUTTON_ID)) return;
    // The channel-header toolbar that holds threads/pins/inbox/help.
    const toolbar =
        document.querySelector('[class*="title_"] [class*="toolbar_"]') ||
        document.querySelector('section[class*="title"] [class*="toolbar"]') ||
        document.querySelector('[class*="toolbar_"]');
    if (!toolbar) return;
    const btn = makeButton();
    toolbar.appendChild(btn); // sits at the end of the icon cluster, by inbox/help
    updateButtons();
}

export default definePlugin({
    name: "Set01Everything",
    description:
        "Adds a header toolbar toggle (next to the inbox button) that turns every avatar, icon, banner, emoji & sticker into Fortnite's Set_01_OA (Geoff Keighley) and renames everyone/their bios to Set_01_OA. Off by default. For fun.",
    authors: [{ name: "Custom", id: 0n }],
    settings,

    start() {
        active = false; // OFF by default on every load
        ensureButton();
        // Re-add the button when Discord re-renders the header / navigates.
        // Debounced with rAF so we never run work on every single mutation.
        let scheduled = false;
        observer = new MutationObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                ensureButton();
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        observer?.disconnect();
        observer = undefined;
        document.querySelectorAll("#" + BUTTON_ID).forEach(b => b.remove());
        if (active) revertEffects();
        active = false;
    },
});
