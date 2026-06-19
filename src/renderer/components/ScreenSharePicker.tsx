/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./screenSharePicker.css";

import { classNameFactory } from "@equicord/types/api/Styles";
import {
    BaseText,
    Button,
    Card,
    CogWheel,
    FormSwitch,
    Heading,
    Margins,
    Paragraph,
    RestartIcon,
    Span
} from "@equicord/types/components";
import {
    closeModal,
    Logger,
    ModalCloseButton,
    Modals,
    ModalSize,
    openModal,
    useAwaiter,
    useForceUpdater
} from "@equicord/types/utils";
import { onceReady } from "@equicord/types/webpack";
import { FluxDispatcher, MediaEngineStore, Select, UserStore, useState } from "@equicord/types/webpack/common";
import { Node } from "@vencord/venmic";
import type { Dispatch, SetStateAction } from "react";
import { useSettings, useVesktopState } from "renderer/settings";
import { isLinux, isWindows } from "renderer/utils";

import { SimpleErrorBoundary } from "./SimpleErrorBoundary";

const StreamResolutions = ["480", "720", "1080", "1440", "2160"] as const;
const StreamFps = ["15", "30", "60"] as const;

const cl = classNameFactory("vcd-screen-picker-");

export type StreamResolution = (typeof StreamResolutions)[number];
export type StreamFps = (typeof StreamFps)[number];

type SpecialSource = "None" | "Entire System";

type AudioSource = SpecialSource | Node;
type AudioSources = SpecialSource | Node[];

interface AudioItem {
    name: string;
    value: AudioSource;
}

interface StreamSettings {
    audio: boolean;
    contentHint?: string;
    includeSources?: AudioSources;
    excludeSources?: AudioSources;
}

export interface StreamPick extends StreamSettings {
    id: string;
}

interface Source {
    id: string;
    name: string;
    url: string;
}

export let currentSettings: StreamSettings | null = null;

const logger = new Logger("EquibopScreenShare");

let streamCloseCallback: ((data: any) => void) | null = null;

if (isLinux) {
    onceReady.then(() => {
        streamCloseCallback = ({ streamKey }: { streamKey: string }) => {
            const owner = streamKey.split(":").at(-1);

            if (owner !== UserStore.getCurrentUser().id) {
                return;
            }

            VesktopNative.virtmic.stop();
        };
        FluxDispatcher.subscribe("STREAM_CLOSE", streamCloseCallback);
    });
}

export function cleanupScreenShareSubscriptions() {
    if (streamCloseCallback) {
        FluxDispatcher.unsubscribe("STREAM_CLOSE", streamCloseCallback);
        streamCloseCallback = null;
    }
}

export function openScreenSharePicker(screens: Source[], skipPicker: boolean) {
    let didSubmit = false;
    return new Promise<StreamPick>((resolve, reject) => {
        const key = openModal(
            props => (
                <ModalComponent
                    screens={screens}
                    modalProps={props}
                    submit={async v => {
                        didSubmit = true;

                        if (v.includeSources && v.includeSources !== "None") {
                            if (v.includeSources === "Entire System") {
                                await VesktopNative.virtmic.startSystem(
                                    !v.excludeSources || isSpecialSource(v.excludeSources) ? [] : v.excludeSources
                                );
                            } else {
                                await VesktopNative.virtmic.start(v.includeSources);
                            }
                        }

                        resolve(v);
                    }}
                    close={() => {
                        props.onClose();
                        if (!didSubmit) reject("Aborted");
                    }}
                    skipPicker={skipPicker}
                />
            ),
            {
                onCloseRequest() {
                    closeModal(key);
                    reject("Aborted");
                },
                onCloseCallback() {
                    if (!didSubmit) reject("Aborted");
                }
            }
        );
    });
}

type TabType = "applications" | "screens" | "devices";

function MonitorIcon() {
    return (
        <svg className={cl("tab-icon")} viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 2.5C2.897 2.5 2 3.397 2 4.5V15.5C2 16.603 2.897 17.5 4 17.5H11V19.5H7V21.5H17V19.5H13V17.5H20C21.103 17.5 22 16.603 22 15.5V4.5C22 3.397 21.103 2.5 20 2.5H4ZM20 4.5V13.5H4V4.5H20Z" />
        </svg>
    );
}

function WindowIcon() {
    return (
        <svg className={cl("tab-icon")} viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 3C2.897 3 2 3.897 2 5V19C2 20.103 2.897 21 4 21H20C21.103 21 22 20.103 22 19V5C22 3.897 21.103 3 20 3H4ZM4 7H20V19H4V7Z" />
        </svg>
    );
}

function DeviceIcon() {
    return (
        <svg className={cl("tab-icon")} viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 2H8C6.897 2 6 2.897 6 4V20C6 21.103 6.897 22 8 22H16C17.103 22 18 21.103 18 20V4C18 2.897 17.103 2 16 2ZM12 20C11.447 20 11 19.553 11 19C11 18.447 11.447 18 12 18C12.553 18 13 18.447 13 19C13 19.553 12.553 20 12 20ZM16 17H8V5H16V17Z" />
        </svg>
    );
}

function ScreenNameIcon({ isScreen }: { isScreen: boolean }) {
    if (isScreen) {
        return (
            <svg className={cl("screen-name-icon")} viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 2.5C2.897 2.5 2 3.397 2 4.5V15.5C2 16.603 2.897 17.5 4 17.5H11V19.5H7V21.5H17V19.5H13V17.5H20C21.103 17.5 22 16.603 22 15.5V4.5C22 3.397 21.103 2.5 20 2.5H4ZM20 4.5V13.5H4V4.5H20Z" />
            </svg>
        );
    }
    return (
        <svg className={cl("screen-name-icon")} viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 3C2.897 3 2 3.897 2 5V19C2 20.103 2.897 21 4 21H20C21.103 21 22 20.103 22 19V5C22 3.897 21.103 3 20 3H4ZM4 7H20V19H4V7Z" />
        </svg>
    );
}

function ScreenPicker({ screens, chooseScreen }: { screens: Source[]; chooseScreen: (id: string) => void }) {
    return (
        <div className={cl("screen-grid")}>
            {screens.map(({ id, name, url }) => (
                <label key={id} className={cl("screen-label")}>
                    <input
                        type="radio"
                        className={cl("screen-radio")}
                        name="screen"
                        value={id}
                        onChange={() => chooseScreen(id)}
                    />

                    <img src={url} alt="" />
                    <Paragraph className={cl("screen-name")}>
                        <ScreenNameIcon isScreen={id.startsWith("screen:")} />
                        {name}
                    </Paragraph>
                </label>
            ))}
        </div>
    );
}

function AudioSettingsModal({
    modalProps,
    close,
    setAudioSources
}: {
    modalProps: any;
    close: () => void;
    setAudioSources: (s: AudioSources) => void;
}) {
    const Settings = useSettings();

    return (
        <Modals.ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <Modals.ModalHeader className={cl("header")}>
                <BaseText size="lg" weight="semibold" tag="h3" style={{ flexGrow: 1 }}>
                    Audio Settings
                </BaseText>
                <ModalCloseButton onClick={close} />
            </Modals.ModalHeader>

            <Modals.ModalContent className={cl("modal", "venmic-settings")}>
                <FormSwitch
                    title="Microphone Workaround"
                    description="Work around an issue that causes the microphone to be shared instead of the correct audio. Only enable if you're experiencing this issue."
                    hideBorder
                    onChange={v => (Settings.audio = { ...Settings.audio, workaround: v })}
                    value={Settings.audio?.workaround ?? false}
                />
                <FormSwitch
                    title="Only Speakers"
                    description={
                        'When sharing entire desktop audio, only share apps that play to a speaker. You may want to disable this when using "mix bussing".'
                    }
                    hideBorder
                    onChange={v => (Settings.audio = { ...Settings.audio, onlySpeakers: v })}
                    value={Settings.audio?.onlySpeakers ?? true}
                />
                <FormSwitch
                    title="Only Default Speakers"
                    description={
                        <>
                            When sharing entire desktop audio, only share apps that play to the <b>default</b> speakers.
                            You may want to disable this when using "mix bussing".
                        </>
                    }
                    hideBorder
                    onChange={v => (Settings.audio = { ...Settings.audio, onlyDefaultSpeakers: v })}
                    value={Settings.audio?.onlyDefaultSpeakers ?? true}
                />
                <FormSwitch
                    title="Ignore Inputs"
                    description="Exclude nodes that are intended to capture audio."
                    hideBorder
                    onChange={v => (Settings.audio = { ...Settings.audio, ignoreInputMedia: v })}
                    value={Settings.audio?.ignoreInputMedia ?? true}
                />
                <FormSwitch
                    title="Ignore Virtual"
                    description={
                        'Exclude virtual nodes, such as nodes belonging to loopbacks. This might be useful when using "mix bussing".'
                    }
                    hideBorder
                    onChange={v => (Settings.audio = { ...Settings.audio, ignoreVirtual: v })}
                    value={Settings.audio?.ignoreVirtual ?? false}
                />
                <FormSwitch
                    title="Ignore Devices"
                    description="Exclude device nodes, such as nodes belonging to microphones or speakers."
                    hideBorder
                    onChange={v =>
                        (Settings.audio = {
                            ...Settings.audio,
                            ignoreDevices: v,
                            deviceSelect: v ? false : Settings.audio?.deviceSelect
                        })
                    }
                    value={Settings.audio?.ignoreDevices ?? true}
                />
                <FormSwitch
                    title="Granular Selection"
                    description="Allow to select applications more granularly."
                    hideBorder
                    onChange={value => {
                        Settings.audio = { ...Settings.audio, granularSelect: value };
                        setAudioSources("None");
                    }}
                    value={Settings.audio?.granularSelect ?? false}
                />
                <FormSwitch
                    title="Device Selection"
                    description={
                        <>
                            Allow to select devices such as microphones. Requires <b>Ignore Devices</b> to be turned
                            off.
                        </>
                    }
                    hideBorder
                    onChange={value => {
                        Settings.audio = { ...Settings.audio, deviceSelect: value };
                        setAudioSources("None");
                    }}
                    value={Settings.audio?.deviceSelect ?? false}
                    disabled={Settings.audio?.ignoreDevices}
                />
            </Modals.ModalContent>
            <Modals.ModalFooter className={cl("footer")}>
                <Button variant="secondary" onClick={close}>
                    Back
                </Button>
            </Modals.ModalFooter>
        </Modals.ModalRoot>
    );
}

function OptionRadio<Settings extends object, Key extends keyof Settings>(props: {
    options: Array<string> | ReadonlyArray<string>;
    labels?: Array<string>;
    settings: Settings;
    settingsKey: Key;
    onChange: (option: string) => void;
}) {
    const { options, settings, settingsKey, labels, onChange } = props;

    return (
        <div className={cl("option-radios")}>
            {(options as string[]).map((option, idx) => (
                <label
                    className={cl("option-radio")}
                    data-checked={settings[settingsKey] === option}
                    key={option}
                    onClick={() => onChange(option)}
                >
                    <Span weight="bold">{labels?.[idx] ?? option}</Span>
                    <input
                        className={cl("option-input")}
                        type="radio"
                        name={String(settingsKey)}
                        value={option}
                        checked={settings[settingsKey] === option}
                        onChange={() => onChange(option)}
                    />
                </label>
            ))}
        </div>
    );
}

function StreamSettingsModal({
    modalProps,
    close,
    settings,
    setSettings,
    qualitySettings
}: {
    modalProps: any;
    close: () => void;
    settings: StreamSettings;
    setSettings: Dispatch<SetStateAction<StreamSettings>>;
    qualitySettings: any;
}) {
    const Settings = useSettings();

    const openAudioSettings = () => {
        openModal(props => (
            <AudioSettingsModal
                modalProps={props}
                close={() => props.onClose()}
                setAudioSources={sources =>
                    setSettings(s => ({ ...s, includeSources: sources, excludeSources: sources }))
                }
            />
        ));
    };

    return (
        <Modals.ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <Modals.ModalHeader className={cl("header")}>
                <BaseText size="lg" weight="semibold" tag="h3" style={{ flexGrow: 1 }}>
                    Stream Settings
                </BaseText>
                <ModalCloseButton onClick={close} />
            </Modals.ModalHeader>

            <Modals.ModalContent className={cl("modal")}>
                <Card className={cl("card")}>
                    <div className={cl("quality")}>
                        <section className={cl("quality-section")}>
                            <Heading tag="h5">Resolution</Heading>
                            <OptionRadio
                                options={StreamResolutions}
                                settings={qualitySettings}
                                settingsKey="resolution"
                                onChange={value => (qualitySettings.resolution = value)}
                            />
                        </section>

                        <section className={cl("quality-section")}>
                            <Heading tag="h5">Frame Rate</Heading>
                            <OptionRadio
                                options={StreamFps}
                                settings={qualitySettings}
                                settingsKey="frameRate"
                                onChange={value => (qualitySettings.frameRate = value)}
                            />
                        </section>
                    </div>
                    <div className={cl("quality")}>
                        <section className={cl("quality-section")}>
                            <Heading tag="h5">Content Type</Heading>
                            <div>
                                <OptionRadio
                                    options={["motion", "detail"]}
                                    labels={["Prefer Smoothness", "Prefer Clarity"]}
                                    settings={settings}
                                    settingsKey="contentHint"
                                    onChange={option => setSettings(s => ({ ...s, contentHint: option }))}
                                />

                                <Paragraph className={Margins.top8}>
                                    Choosing "Prefer Clarity" will result in a significantly lower framerate in exchange
                                    for a much sharper and clearer image.
                                </Paragraph>
                            </div>
                            {isWindows && (
                                <FormSwitch
                                    title="Stream With Audio"
                                    hideBorder
                                    value={settings.audio}
                                    onChange={checked => setSettings(s => ({ ...s, audio: checked }))}
                                    className={cl("audio")}
                                />
                            )}
                        </section>
                    </div>

                    {isLinux && (
                        <AudioSourcePickerLinux
                            openSettings={openAudioSettings}
                            includeSources={settings.includeSources}
                            excludeSources={settings.excludeSources}
                            deviceSelect={Settings.audio?.deviceSelect}
                            granularSelect={Settings.audio?.granularSelect}
                            setIncludeSources={sources => setSettings(s => ({ ...s, includeSources: sources }))}
                            setExcludeSources={sources => setSettings(s => ({ ...s, excludeSources: sources }))}
                        />
                    )}
                </Card>
            </Modals.ModalContent>
            <Modals.ModalFooter className={cl("footer")}>
                <Button onClick={close}>
                    Done
                </Button>
            </Modals.ModalFooter>
        </Modals.ModalRoot>
    );
}

function isSpecialSource(value?: AudioSource | AudioSources): value is SpecialSource {
    return typeof value === "string";
}

function hasMatchingProps(value: Node, other: Node) {
    return Object.keys(value).every(key => value[key] === other[key]);
}

function mapToAudioItem(node: AudioSource, granularSelect?: boolean, deviceSelect?: boolean): AudioItem[] {
    if (isSpecialSource(node)) {
        return [{ name: node, value: node }];
    }

    const rtn: AudioItem[] = [];

    const mediaClass = node["media.class"];

    if (mediaClass?.includes("Video") || mediaClass?.includes("Midi")) {
        return rtn;
    }

    if (!deviceSelect && node["device.id"]) {
        return rtn;
    }

    const name = node["application.name"];

    if (name) {
        rtn.push({ name: name, value: { "application.name": name } });
    }

    if (!granularSelect) {
        return rtn;
    }

    const rawName = node["node.name"];

    if (!name) {
        rtn.push({ name: rawName, value: { "node.name": rawName } });
    }

    const binary = node["application.process.binary"];

    if (!name && binary) {
        rtn.push({ name: binary, value: { "application.process.binary": binary } });
    }

    const pid = node["application.process.id"];

    const first = rtn[0];
    const firstValues = first.value as Node;

    if (pid) {
        rtn.push({
            name: `${first.name} (${pid})`,
            value: { ...firstValues, "application.process.id": pid }
        });
    }

    const mediaName = node["media.name"];

    if (mediaName) {
        rtn.push({
            name: `${first.name} [${mediaName}]`,
            value: { ...firstValues, "media.name": mediaName }
        });
    }

    if (mediaClass) {
        rtn.push({
            name: `${first.name} [${mediaClass}]`,
            value: { ...firstValues, "media.class": mediaClass }
        });
    }

    return rtn;
}

function isItemSelected(sources?: AudioSources) {
    return (value: AudioSource) => {
        if (!sources) {
            return false;
        }

        if (isSpecialSource(sources) || isSpecialSource(value)) {
            return sources === value;
        }

        return sources.some(source => hasMatchingProps(source, value));
    };
}

function updateItems(setSources: (s: AudioSources) => void, sources?: AudioSources) {
    return (value: AudioSource) => {
        if (isSpecialSource(value)) {
            setSources(value);
            return;
        }

        if (isSpecialSource(sources)) {
            setSources([value]);
            return;
        }

        if (isItemSelected(sources)(value)) {
            setSources(sources?.filter(x => !hasMatchingProps(x, value)) ?? "None");
            return;
        }

        setSources([...(sources || []), value]);
    };
}

function AudioSourcePickerLinux({
    includeSources,
    excludeSources,
    deviceSelect,
    granularSelect,
    openSettings,
    setIncludeSources,
    setExcludeSources
}: {
    includeSources?: AudioSources;
    excludeSources?: AudioSources;
    deviceSelect?: boolean;
    granularSelect?: boolean;
    openSettings: () => void;
    setIncludeSources: (s: AudioSources) => void;
    setExcludeSources: (s: AudioSources) => void;
}) {
    const [audioSourcesSignal, refreshAudioSources] = useForceUpdater(true);
    const [sources, _, loading] = useAwaiter(() => VesktopNative.virtmic.list(), {
        fallbackValue: { ok: true, targets: [], hasPipewirePulse: true },
        deps: [audioSourcesSignal]
    });

    const hasPipewirePulse = sources.ok ? sources.hasPipewirePulse : true;
    const [ignorePulseWarning, setIgnorePulseWarning] = useState(false);

    if (!sources.ok && sources.isGlibCxxOutdated) {
        return (
            <Paragraph>
                Failed to retrieve Audio Sources because your C++ library is too old to run
                <a href="https://github.com/Vencord/venmic" target="_blank" rel="noreferrer">
                    venmic
                </a>
                . See{" "}
                <a
                    href="https://gist.github.com/Vendicated/b655044ffbb16b2716095a448c6d827a"
                    target="_blank"
                    rel="noreferrer"
                >
                    this guide
                </a>{" "}
                for possible solutions.
            </Paragraph>
        );
    }

    if (!hasPipewirePulse && !ignorePulseWarning) {
        return (
            <Paragraph>
                Could not find pipewire-pulse. See{" "}
                <a
                    href="https://gist.github.com/the-spyke/2de98b22ff4f978ebf0650c90e82027e#install"
                    target="_blank"
                    rel="noreferrer"
                >
                    this guide
                </a>{" "}
                on how to switch to pipewire. <br />
                You can still continue, however, please{" "}
                <b>beware that you can only share audio of apps that are running under pipewire</b>.{" "}
                <a onClick={() => setIgnorePulseWarning(true)}>I know what I'm doing!</a>
            </Paragraph>
        );
    }

    const specialSources: SpecialSource[] = ["None", "Entire System"] as const;

    const uniqueName = (value: AudioItem, index: number, list: AudioItem[]) =>
        list.findIndex(x => x.name === value.name) === index;

    const allSources = sources.ok
        ? [...specialSources, ...sources.targets]
              .map(target => mapToAudioItem(target, granularSelect, deviceSelect))
              .flat()
              .filter(uniqueName)
        : [];

    return (
        <>
            <div className={cl("audio-sources")}>
                <section>
                    <Heading tag="h5">{loading ? "Loading Sources..." : "Audio Sources"}</Heading>
                    <SimpleErrorBoundary>
                        <Select
                            options={allSources.map(({ name, value }) => ({
                                label: name,
                                value: value,
                                default: name === "None"
                            }))}
                            isSelected={isItemSelected(includeSources)}
                            select={updateItems(setIncludeSources, includeSources)}
                            serialize={String}
                            popoutPosition="top"
                            closeOnSelect={false}
                        />
                    </SimpleErrorBoundary>
                </section>
                {includeSources === "Entire System" && (
                    <section>
                        <Heading tag="h5">Exclude Sources</Heading>
                        <SimpleErrorBoundary>
                            <Select
                                options={allSources
                                    .filter(x => x.name !== "Entire System")
                                    .map(({ name, value }) => ({
                                        label: name,
                                        value: value,
                                        default: name === "None"
                                    }))}
                                isSelected={isItemSelected(excludeSources)}
                                select={updateItems(setExcludeSources, excludeSources)}
                                serialize={String}
                                popoutPosition="top"
                                closeOnSelect={false}
                            />
                        </SimpleErrorBoundary>
                    </section>
                )}
            </div>
            <div className={cl("settings-buttons")}>
                <Button variant="secondary" onClick={refreshAudioSources} className={cl("settings-button")}>
                    <RestartIcon className={cl("settings-button-icon")} />
                    Refresh Audio Sources
                </Button>
                <Button variant="secondary" onClick={openSettings} className={cl("settings-button")}>
                    <CogWheel className={cl("settings-button-icon")} />
                    Open Audio Settings
                </Button>
            </div>
        </>
    );
}

function getPresetName(contentHint?: string): string {
    return contentHint === "detail" ? "Better Readability" : "Gaming";
}

function getPresetDescription(contentHint?: string): string {
    return contentHint === "detail" ? "Sharper image" : "Smoother video";
}

function BottomBar({
    settings,
    setSettings,
    qualitySettings
}: {
    settings: StreamSettings;
    setSettings: Dispatch<SetStateAction<StreamSettings>>;
    qualitySettings: any;
}) {
    const openSettings = () => {
        openModal(props => (
            <StreamSettingsModal
                modalProps={props}
                close={() => props.onClose()}
                settings={settings}
                setSettings={setSettings}
                qualitySettings={qualitySettings}
            />
        ));
    };

    return (
        <div className={cl("bottom-bar")}>
            <div className={cl("bottom-bar-info")}>
                <span className={cl("preset-name")}>{getPresetName(settings.contentHint)}</span>
                <span className={cl("preset-details")}>
                    {getPresetDescription(settings.contentHint)}
                    <span className={cl("preset-dot")} />
                    {qualitySettings.resolution}p
                    <span className={cl("preset-dot")} />
                    {qualitySettings.frameRate}fps
                </span>
            </div>
            <button className={cl("gear-button")} onClick={openSettings} title="Stream Settings">
                <CogWheel />
            </button>
        </div>
    );
}

function ModalComponent({
    screens,
    modalProps,
    submit,
    close,
    skipPicker
}: {
    screens: Source[];
    modalProps: any;
    submit: (data: StreamPick) => void;
    close: () => void;
    skipPicker: boolean;
}) {
    const [selected, setSelected] = useState<string | undefined>(skipPicker ? screens[0].id : void 0);
    const [activeTab, setActiveTab] = useState<TabType>("applications");
    const [settings, setSettings] = useState<StreamSettings>({
        contentHint: "motion",
        audio: true,
        includeSources: "None"
    });
    const qualitySettings = (useVesktopState().screenshareQuality ??= {
        resolution: "720",
        frameRate: "30"
    });

    const applicationScreens = screens.filter(s => s.id.startsWith("window:"));
    const entireScreens = screens.filter(s => s.id.startsWith("screen:"));

    const currentScreens =
        activeTab === "applications" ? applicationScreens : activeTab === "screens" ? entireScreens : [];

    const handleChooseScreen = (id: string) => {
        setSelected(id);
    };

    const handleGoLive = () => {
        if (!selected) return;

        currentSettings = settings;
        try {
            const frameRate = Number(qualitySettings.frameRate);
            const height = Number(qualitySettings.resolution);
            const width = Math.round(height * (16 / 9));

            const conn = [...MediaEngineStore.getMediaEngine().connections].find(
                connection => connection.streamUserId === UserStore.getCurrentUser().id
            );

            if (conn) {
                conn.videoStreamParameters[0].maxFrameRate = frameRate;
                conn.videoStreamParameters[0].maxResolution.height = height;
                conn.videoStreamParameters[0].maxResolution.width = width;
            }

            submit({
                id: selected!,
                ...settings
            });

            setTimeout(async () => {
                const conn = [...MediaEngineStore.getMediaEngine().connections].find(
                    connection => connection.streamUserId === UserStore.getCurrentUser().id
                );
                if (!conn) return;

                const track = conn.input.stream.getVideoTracks()[0];

                const constraints = {
                    ...track.getConstraints(),
                    frameRate: { min: frameRate, ideal: frameRate },
                    width: { min: 640, ideal: width, max: width },
                    height: { min: 480, ideal: height, max: height },
                    advanced: [{ width: width, height: height }],
                    resizeMode: "none"
                };

                try {
                    await track.applyConstraints(constraints);

                    logger.info("Applied constraints successfully. New constraints:", track.getConstraints());
                } catch (e) {
                    logger.error("Failed to apply constraints.", e);
                }
            }, 100);
        } catch (error) {
            logger.error("Error while submitting stream.", error);
        }

        close();
    };

    return (
        <Modals.ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <Modals.ModalHeader className={cl("header")}>
                <img
                    className={cl("logo")}
                    src="https://raw.githubusercontent.com/nicedozie4u/Supercord/refs/heads/main/static/icon.png"
                    alt="Supercord"
                    onError={e => {
                        (e.target as HTMLImageElement).style.display = "none";
                    }}
                />
                <div className={cl("tabs")}>
                    <button
                        className={cl("tab")}
                        data-active={activeTab === "applications"}
                        onClick={() => setActiveTab("applications")}
                    >
                        <WindowIcon />
                        Applications
                    </button>
                    <button
                        className={cl("tab")}
                        data-active={activeTab === "screens"}
                        onClick={() => setActiveTab("screens")}
                    >
                        <MonitorIcon />
                        Entire Screen
                    </button>
                    <button
                        className={cl("tab")}
                        data-active={activeTab === "devices"}
                        onClick={() => setActiveTab("devices")}
                    >
                        <DeviceIcon />
                        Devices
                    </button>
                </div>
                <ModalCloseButton onClick={close} />
            </Modals.ModalHeader>
            <Modals.ModalContent className={cl("modal")}>
                {activeTab === "devices" ? (
                    <div className={cl("empty")}>
                        <DeviceIcon />
                        <span className={cl("empty-text")}>No capture devices available</span>
                    </div>
                ) : currentScreens.length === 0 ? (
                    <div className={cl("empty")}>
                        <span className={cl("empty-text")}>
                            {activeTab === "applications"
                                ? "No application windows found"
                                : "No screens found"}
                        </span>
                    </div>
                ) : (
                    <ScreenPicker screens={currentScreens} chooseScreen={handleChooseScreen} />
                )}
            </Modals.ModalContent>
            <Modals.ModalFooter className={cl("footer")}>
                <BottomBar settings={settings} setSettings={setSettings} qualitySettings={qualitySettings} />

                {selected && (
                    <Button onClick={handleGoLive}>
                        Go Live
                    </Button>
                )}

                {selected && !skipPicker ? (
                    <Button variant="secondary" onClick={() => setSelected(void 0)}>
                        Back
                    </Button>
                ) : (
                    <Button variant="secondary" onClick={close}>
                        Cancel
                    </Button>
                )}
            </Modals.ModalFooter>
        </Modals.ModalRoot>
    );
}
